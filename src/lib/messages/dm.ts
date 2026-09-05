import { prisma } from "@/lib/prisma";
import { isBlockedEitherWay } from "@/lib/community/block";

// Private 1:1 chat between any two Vidalyse users, gated the same way as
// VidalyseFollow (see src/lib/community/follow.ts): you can only start a
// conversation with a user who has a PUBLIC community profile, so DMs never
// reach an account that never opted into the Community. Once a conversation
// exists, either side can keep messaging even if the other later goes private
// — unless either has blocked the other (see isBlockedEitherWay), which stops
// new messages both ways immediately.

const MAX_MESSAGE_LENGTH = 4000;

// `Conversation.userAId` is always the lexicographically smaller of the two
// member ids, so `@@unique([userAId, userBId])` catches a duplicate no matter
// who starts it.
function orderPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

export type StartConversationResult =
  | { ok: true; conversationId: string }
  | { ok: false; error: "self" | "not_found" | "blocked" };

export async function getOrCreateConversation(
  userId: string,
  otherUserId: string
): Promise<StartConversationResult> {
  if (userId === otherUserId) return { ok: false, error: "self" };
  if (await isBlockedEitherWay(userId, otherUserId)) return { ok: false, error: "blocked" };

  const target = await prisma.publicProfile.findUnique({
    where: { userId: otherUserId },
    select: { isPublic: true },
  });
  if (!target || !target.isPublic) return { ok: false, error: "not_found" };

  const [userAId, userBId] = orderPair(userId, otherUserId);
  const conversation = await prisma.conversation.upsert({
    where: { userAId_userBId: { userAId, userBId } },
    update: {},
    create: { userAId, userBId },
    select: { id: true },
  });
  return { ok: true, conversationId: conversation.id };
}

export interface ConversationSummary {
  id: string;
  otherUser: {
    id: string;
    handle: string;
    displayName: string | null;
    avatarUrl: string | null;
  };
  lastMessage: { content: string; createdAt: Date; fromMe: boolean } | null;
  unreadCount: number;
  updatedAt: Date;
}

export async function listConversations(userId: string): Promise<ConversationSummary[]> {
  const rows = await prisma.conversation.findMany({
    where: { OR: [{ userAId: userId }, { userBId: userId }] },
    orderBy: { updatedAt: "desc" },
    include: {
      userA: { select: { id: true, publicProfile: true } },
      userB: { select: { id: true, publicProfile: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  const out: ConversationSummary[] = [];
  for (const row of rows) {
    const other = row.userA.id === userId ? row.userB : row.userA;
    const last = row.messages[0] ?? null;
    const unreadCount = await prisma.directMessage.count({
      where: { conversationId: row.id, senderId: { not: userId }, readAt: null },
    });
    out.push({
      id: row.id,
      otherUser: {
        id: other.id,
        handle: other.publicProfile?.handle ?? "",
        displayName: other.publicProfile?.displayName ?? null,
        avatarUrl: other.publicProfile?.avatarUrl ?? null,
      },
      lastMessage: last
        ? { content: last.content, createdAt: last.createdAt, fromMe: last.senderId === userId }
        : null,
      unreadCount,
      updatedAt: row.updatedAt,
    });
  }
  return out;
}

async function requireMembership(userId: string, conversationId: string) {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: {
      id: true,
      userAId: true,
      userBId: true,
      userA: { select: { id: true, publicProfile: true } },
      userB: { select: { id: true, publicProfile: true } },
    },
  });
  if (!conversation) return null;
  if (conversation.userAId !== userId && conversation.userBId !== userId) return null;
  return conversation;
}

export interface ConversationDetail {
  id: string;
  otherUser: {
    id: string;
    handle: string;
    displayName: string | null;
    avatarUrl: string | null;
  };
  // Whether the CURRENT user has blocked the other one — drives the
  // Bloquer/Débloquer toggle. Doesn't reflect the reverse direction.
  blockedByMe: boolean;
}

export async function getConversationDetail(
  userId: string,
  conversationId: string
): Promise<ConversationDetail | null> {
  const conversation = await requireMembership(userId, conversationId);
  if (!conversation) return null;
  const other = conversation.userAId === userId ? conversation.userB : conversation.userA;
  const block = await prisma.blockedUser.findUnique({
    where: { blockerId_blockedId: { blockerId: userId, blockedId: other.id } },
    select: { id: true },
  });
  return {
    id: conversation.id,
    otherUser: {
      id: other.id,
      handle: other.publicProfile?.handle ?? "",
      displayName: other.publicProfile?.displayName ?? null,
      avatarUrl: other.publicProfile?.avatarUrl ?? null,
    },
    blockedByMe: block !== null,
  };
}

export interface DirectMessageRow {
  id: string;
  senderId: string;
  content: string;
  createdAt: Date;
}

// Latest 100 messages — good enough for a first version; no pagination yet.
export async function listMessages(
  userId: string,
  conversationId: string
): Promise<DirectMessageRow[] | null> {
  const conversation = await requireMembership(userId, conversationId);
  if (!conversation) return null;
  const rows = await prisma.directMessage.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
    take: 100,
    select: { id: true, senderId: true, content: true, createdAt: true },
  });
  return rows;
}

// Polling helper: only the messages strictly after `afterId` (by createdAt),
// so the client doesn't have to re-render the whole thread every tick.
export async function listMessagesAfter(
  userId: string,
  conversationId: string,
  afterId: string | null
): Promise<DirectMessageRow[] | null> {
  const conversation = await requireMembership(userId, conversationId);
  if (!conversation) return null;

  let cursorCreatedAt: Date | undefined;
  if (afterId) {
    const cursor = await prisma.directMessage.findUnique({
      where: { id: afterId },
      select: { createdAt: true },
    });
    cursorCreatedAt = cursor?.createdAt;
  }

  const rows = await prisma.directMessage.findMany({
    where: {
      conversationId,
      ...(cursorCreatedAt ? { createdAt: { gt: cursorCreatedAt } } : {}),
    },
    orderBy: { createdAt: "asc" },
    take: 100,
    select: { id: true, senderId: true, content: true, createdAt: true },
  });
  return rows;
}

export type SendMessageResult =
  | { ok: true; message: DirectMessageRow }
  | { ok: false; error: "not_found" | "empty" | "blocked" };

export async function sendMessage(
  userId: string,
  conversationId: string,
  rawContent: string
): Promise<SendMessageResult> {
  const conversation = await requireMembership(userId, conversationId);
  if (!conversation) return { ok: false, error: "not_found" };

  const otherId = conversation.userAId === userId ? conversation.userBId : conversation.userAId;
  if (await isBlockedEitherWay(userId, otherId)) return { ok: false, error: "blocked" };

  const content = rawContent.trim().slice(0, MAX_MESSAGE_LENGTH);
  if (!content) return { ok: false, error: "empty" };

  const [message] = await prisma.$transaction([
    prisma.directMessage.create({
      data: { conversationId, senderId: userId, content },
      select: { id: true, senderId: true, content: true, createdAt: true },
    }),
    prisma.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } }),
  ]);
  return { ok: true, message };
}

export async function markConversationRead(userId: string, conversationId: string): Promise<void> {
  const conversation = await requireMembership(userId, conversationId);
  if (!conversation) return;
  await prisma.directMessage.updateMany({
    where: { conversationId, senderId: { not: userId }, readAt: null },
    data: { readAt: new Date() },
  });
}

export async function totalUnreadCount(userId: string): Promise<number> {
  return prisma.directMessage.count({
    where: {
      readAt: null,
      senderId: { not: userId },
      conversation: { OR: [{ userAId: userId }, { userBId: userId }] },
    },
  });
}
