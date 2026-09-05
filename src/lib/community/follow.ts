import { prisma } from "@/lib/prisma";
import { isBlockedEitherWay } from "./block";

// Vidalyse follows (§5 / "s'abonner"). One row per (follower, target); a user
// can't follow themselves; you can only follow a creator who has a PUBLIC
// community profile. Enforced by @@unique([followerId, targetId]) plus the
// checks here so a race is a no-op, not a 500.

export type ToggleFollowResult =
  | { ok: true; following: boolean; followerCount: number }
  | { ok: false; error: "self" | "not_found" | "blocked" };

export async function toggleFollow(
  followerId: string,
  targetUserId: string
): Promise<ToggleFollowResult> {
  if (followerId === targetUserId) return { ok: false, error: "self" };
  if (await isBlockedEitherWay(followerId, targetUserId)) return { ok: false, error: "blocked" };

  const target = await prisma.publicProfile.findUnique({
    where: { userId: targetUserId },
    select: { isPublic: true },
  });
  if (!target || !target.isPublic) return { ok: false, error: "not_found" };

  const existing = await prisma.vidalyseFollow.findUnique({
    where: { followerId_targetId: { followerId, targetId: targetUserId } },
    select: { id: true },
  });

  if (existing) {
    await prisma.vidalyseFollow.delete({ where: { id: existing.id } });
  } else {
    try {
      await prisma.vidalyseFollow.create({ data: { followerId, targetId: targetUserId } });
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code !== "P2002") throw err; // swallow only the unique-race
    }
  }

  const followerCount = await prisma.vidalyseFollow.count({ where: { targetId: targetUserId } });
  return { ok: true, following: !existing, followerCount };
}

export async function getFollowState(
  viewerId: string | null,
  targetUserId: string
): Promise<{ following: boolean; followerCount: number }> {
  const [followerCount, mine] = await Promise.all([
    prisma.vidalyseFollow.count({ where: { targetId: targetUserId } }),
    viewerId
      ? prisma.vidalyseFollow.findUnique({
          where: { followerId_targetId: { followerId: viewerId, targetId: targetUserId } },
          select: { id: true },
        })
      : Promise.resolve(null),
  ]);
  return { following: Boolean(mine), followerCount };
}

// Batch follow state for a list of target users, for hydrating a list of
// creators without N queries.
export async function followStates(
  viewerId: string,
  targetUserIds: string[]
): Promise<Map<string, { following: boolean; followerCount: number }>> {
  const out = new Map<string, { following: boolean; followerCount: number }>();
  if (targetUserIds.length === 0) return out;
  const [counts, mine] = await Promise.all([
    prisma.vidalyseFollow.groupBy({
      by: ["targetId"],
      where: { targetId: { in: targetUserIds } },
      _count: { _all: true },
    }),
    prisma.vidalyseFollow.findMany({
      where: { followerId: viewerId, targetId: { in: targetUserIds } },
      select: { targetId: true },
    }),
  ]);
  const followingSet = new Set(mine.map((m) => m.targetId));
  const countByTarget = new Map(counts.map((c) => [c.targetId, c._count._all]));
  for (const id of targetUserIds) {
    out.set(id, {
      following: followingSet.has(id),
      followerCount: countByTarget.get(id) ?? 0,
    });
  }
  return out;
}

export async function followCounts(
  userId: string
): Promise<{ followers: number; following: number }> {
  const [followers, following] = await Promise.all([
    prisma.vidalyseFollow.count({ where: { targetId: userId } }),
    prisma.vidalyseFollow.count({ where: { followerId: userId } }),
  ]);
  return { followers, following };
}
