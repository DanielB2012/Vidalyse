import { prisma } from "@/lib/prisma";

// Community search: public creators by handle/name, and visible community videos
// by title. SQLite LIKE is case-insensitive for ASCII, which is fine here.

export interface SearchResults {
  q: string;
  creators: {
    handle: string;
    displayName: string | null;
    avatarUrl: string | null;
    bio: string | null;
  }[];
  videos: {
    publicId: string;
    title: string;
    thumbnailUrl: string | null;
    fromYoutube: boolean;
    creatorHandle: string;
    creatorName: string | null;
  }[];
}

export async function searchCommunity(opts: {
  q: string;
  limit?: number;
}): Promise<SearchResults> {
  const q = opts.q.trim();
  const limit = opts.limit ?? 20;
  if (q.length < 2) return { q, creators: [], videos: [] };

  const [profiles, videos] = await Promise.all([
    prisma.publicProfile.findMany({
      where: {
        isPublic: true,
        OR: [
          { handle: { contains: q } },
          { displayName: { contains: q } },
        ],
      },
      take: limit,
      orderBy: { updatedAt: "desc" },
      select: { handle: true, displayName: true, avatarUrl: true, bio: true },
    }),
    prisma.publicVideo.findMany({
      where: {
        OR: [{ isPublic: true }, { youtubePublic: true }],
        user: { publicProfile: { isPublic: true } },
        title: { contains: q },
      },
      take: limit,
      orderBy: [{ publishedAt: "desc" }, { publicId: "desc" }],
      select: {
        publicId: true,
        title: true,
        thumbnailUrl: true,
        source: true,
        user: { select: { publicProfile: { select: { handle: true, displayName: true } } } },
      },
    }),
  ]);

  return {
    q,
    creators: profiles,
    videos: videos.map((v) => ({
      publicId: v.publicId,
      title: v.title ?? "",
      thumbnailUrl:
        v.source === "youtube"
          ? v.thumbnailUrl
          : v.thumbnailUrl
            ? `/api/community/${v.publicId}/thumbnail`
            : null,
      fromYoutube: v.source === "youtube",
      creatorHandle: v.user.publicProfile?.handle ?? "",
      creatorName: v.user.publicProfile?.displayName ?? null,
    })),
  };
}
