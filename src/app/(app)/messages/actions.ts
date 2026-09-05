"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import {
  getOrCreateConversation,
  listMessagesAfter,
  sendMessage,
  markConversationRead,
  listConversations,
  totalUnreadCount,
  type StartConversationResult,
  type SendMessageResult,
  type DirectMessageRow,
  type ConversationSummary,
} from "@/lib/messages/dm";
import { SOCIAL_ENABLED } from "@/lib/features";

async function requireUserId(): Promise<string> {
  if (!SOCIAL_ENABLED) throw new Error("La messagerie est désactivée sur cette installation.");
  const session = await auth();
  if (!session?.user?.id) throw new Error("unauthenticated");
  return session.user.id;
}

export async function startConversationAction(targetUserId: string): Promise<StartConversationResult> {
  const userId = await requireUserId();
  const res = await getOrCreateConversation(userId, targetUserId);
  if (res.ok) revalidatePath("/messages");
  return res;
}

export async function sendMessageAction(
  conversationId: string,
  content: string
): Promise<SendMessageResult> {
  const userId = await requireUserId();
  const res = await sendMessage(userId, conversationId, content);
  if (res.ok) revalidatePath("/messages");
  return res;
}

export async function loadMessagesAfterAction(
  conversationId: string,
  afterId: string | null
): Promise<DirectMessageRow[]> {
  const userId = await requireUserId();
  return (await listMessagesAfter(userId, conversationId, afterId)) ?? [];
}

export async function markReadAction(conversationId: string): Promise<void> {
  const userId = await requireUserId();
  await markConversationRead(userId, conversationId);
  revalidatePath("/messages");
}

export async function listConversationsAction(): Promise<ConversationSummary[]> {
  const userId = await requireUserId();
  return listConversations(userId);
}

export async function unreadCountAction(): Promise<number> {
  const userId = await requireUserId();
  return totalUnreadCount(userId);
}
