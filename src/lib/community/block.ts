import { prisma } from "@/lib/prisma";

// Blocking is one-directional in storage (A blocked B) but two-directional in
// effect: neither side can message or follow the other once either has
// blocked, so a block always cuts contact regardless of who initiated it —
// see isBlockedEitherWay, used by src/lib/messages/dm.ts and
// src/lib/community/follow.ts before letting two users interact.

export type ToggleBlockResult =
  | { ok: true; blocked: boolean }
  | { ok: false; error: "self" };

export async function toggleBlock(
  blockerId: string,
  targetUserId: string
): Promise<ToggleBlockResult> {
  if (blockerId === targetUserId) return { ok: false, error: "self" };

  const existing = await prisma.blockedUser.findUnique({
    where: { blockerId_blockedId: { blockerId, blockedId: targetUserId } },
    select: { id: true },
  });

  if (existing) {
    await prisma.blockedUser.delete({ where: { id: existing.id } });
    return { ok: true, blocked: false };
  }

  try {
    await prisma.blockedUser.create({ data: { blockerId, blockedId: targetUserId } });
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code !== "P2002") throw err; // swallow only the unique-race
  }
  return { ok: true, blocked: true };
}

// True if either user has blocked the other.
export async function isBlockedEitherWay(userId: string, otherUserId: string): Promise<boolean> {
  const row = await prisma.blockedUser.findFirst({
    where: {
      OR: [
        { blockerId: userId, blockedId: otherUserId },
        { blockerId: otherUserId, blockedId: userId },
      ],
    },
    select: { id: true },
  });
  return row !== null;
}

// True only if `userId` is the one who blocked `otherUserId` — for showing
// "Débloquer" vs "Bloquer" on a profile/thread (as opposed to isBlockedEitherWay,
// which also returns true if the OTHER user blocked you).
export async function hasBlocked(userId: string, otherUserId: string): Promise<boolean> {
  const row = await prisma.blockedUser.findUnique({
    where: { blockerId_blockedId: { blockerId: userId, blockedId: otherUserId } },
    select: { id: true },
  });
  return row !== null;
}
