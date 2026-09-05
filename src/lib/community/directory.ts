import { prisma } from "@/lib/prisma";

// Discovery: the list of creators with a PUBLIC community profile, so you can
// browse other people from /community even before following them (Phase C adds
// follow). Never lists private profiles.

export interface CreatorCard {
  userId: string;
  handle: string;
  displayName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  publicationCount: number;
}

export async function listPublicCreators(opts: {
  excludeUserId?: string | null;
  limit?: number;
  // Filters by @handle or display name (e.g. the "find someone to message"
  // picker) — omit to just browse the most recently active public profiles.
  q?: string;
}): Promise<CreatorCard[]> {
  const q = opts.q?.trim();
  const profiles = await prisma.publicProfile.findMany({
    where: {
      isPublic: true,
      ...(opts.excludeUserId ? { NOT: { userId: opts.excludeUserId } } : {}),
      ...(q ? { OR: [{ handle: { contains: q } }, { displayName: { contains: q } }] } : {}),
    },
    orderBy: { updatedAt: "desc" },
    take: opts.limit ?? 30,
    select: {
      userId: true,
      handle: true,
      displayName: true,
      avatarUrl: true,
      bio: true,
    },
  });
  if (profiles.length === 0) return [];

  // Publication counts in one grouped query.
  const counts = await prisma.publicVideo.groupBy({
    by: ["userId"],
    where: { isPublic: true, userId: { in: profiles.map((p) => p.userId) } },
    _count: { _all: true },
  });
  const byUser = new Map(counts.map((c) => [c.userId, c._count._all]));

  return profiles.map((p) => ({
    userId: p.userId,
    handle: p.handle,
    displayName: p.displayName,
    avatarUrl: p.avatarUrl,
    bio: p.bio,
    publicationCount: byUser.get(p.userId) ?? 0,
  }));
}
