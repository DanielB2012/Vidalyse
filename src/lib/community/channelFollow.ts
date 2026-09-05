import { prisma } from "@/lib/prisma";

// "Subscribe" to a YouTube channel that isn't (yet) on Vidalyse. Stored on the
// Vidalyse side only — read-only OAuth can't touch the real YouTube sub. One row
// per (user, channel), enforced by @@unique plus the P2002 swallow here.

export type ToggleChannelFollowResult = { following: boolean; count: number };

export async function toggleChannelFollow(
  userId: string,
  input: { youtubeChannelId: string; channelTitle?: string | null; thumbnailUrl?: string | null }
): Promise<ToggleChannelFollowResult> {
  const { youtubeChannelId } = input;
  const existing = await prisma.channelFollow.findUnique({
    where: { userId_youtubeChannelId: { userId, youtubeChannelId } },
    select: { id: true },
  });

  if (existing) {
    await prisma.channelFollow.delete({ where: { id: existing.id } });
  } else {
    try {
      await prisma.channelFollow.create({
        data: {
          userId,
          youtubeChannelId,
          channelTitle: input.channelTitle?.slice(0, 200) ?? null,
          thumbnailUrl: input.thumbnailUrl ?? null,
        },
      });
    } catch (err) {
      if ((err as { code?: string })?.code !== "P2002") throw err;
    }
  }

  const count = await prisma.channelFollow.count({ where: { youtubeChannelId } });
  return { following: !existing, count };
}

export async function getChannelFollowState(
  userId: string,
  youtubeChannelId: string
): Promise<{ following: boolean; count: number }> {
  const [count, mine] = await Promise.all([
    prisma.channelFollow.count({ where: { youtubeChannelId } }),
    prisma.channelFollow.findUnique({
      where: { userId_youtubeChannelId: { userId, youtubeChannelId } },
      select: { id: true },
    }),
  ]);
  return { following: Boolean(mine), count };
}

export async function followedChannelIds(userId: string): Promise<Set<string>> {
  const rows = await prisma.channelFollow.findMany({
    where: { userId },
    select: { youtubeChannelId: true },
  });
  return new Set(rows.map((r) => r.youtubeChannelId));
}

export async function listMyChannelFollows(userId: string) {
  return prisma.channelFollow.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: { youtubeChannelId: true, channelTitle: true, thumbnailUrl: true },
  });
}
