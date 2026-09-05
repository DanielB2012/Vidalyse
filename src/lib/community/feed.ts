import { prisma } from "@/lib/prisma";

// Community feed (§13). Shows a video when the owner's profile is public AND the
// video is either explicitly published (PublicVideo.isPublic) OR currently
// public on YouTube (youtubePublic — the auto-mirror). Cursor-paginated on
// (publishedAt, publicId) so a large feed is never loaded at once.

export const FEED_PAGE_SIZE = 10;

export interface FeedItem {
  publicId: string;
  title: string;
  summary: string | null;
  /** Thumbnail: the community route for analysed videos, YouTube's CDN URL for
   *  auto-mirrored ones, or null. */
  thumbnailUrl: string | null;
  publishedAt: string; // ISO
  /** Set for auto-mirrored YouTube videos — the card links out to YouTube and
   *  has no Vidalyse analysis summary. */
  youtubeVideoId: string | null;
  fromYoutube: boolean;
  likeCount: number;
  likedByViewer: boolean;
  creator: {
    handle: string;
    displayName: string | null;
    avatarUrl: string | null;
  };
}

export interface FeedPage {
  items: FeedItem[];
  nextCursor: string | null;
}

export async function listCommunityFeed(opts: {
  viewerId: string | null;
  cursor: string | null;
  pageSize?: number;
}): Promise<FeedPage> {
  const pageSize = opts.pageSize ?? FEED_PAGE_SIZE;

  const rows = await prisma.publicVideo.findMany({
    where: {
      OR: [{ isPublic: true }, { youtubePublic: true }],
      user: { publicProfile: { isPublic: true } },
    },
    orderBy: [{ publishedAt: "desc" }, { publicId: "desc" }],
    take: pageSize + 1,
    ...(opts.cursor ? { cursor: { publicId: opts.cursor }, skip: 1 } : {}),
    select: {
      id: true,
      publicId: true,
      title: true,
      summary: true,
      thumbnailUrl: true,
      source: true,
      youtubeVideoId: true,
      publishedAt: true,
      createdAt: true,
      _count: { select: { likes: true } },
      user: {
        select: {
          publicProfile: {
            select: {
              handle: true,
              displayName: true,
              avatarUrl: true,
              youtubeChannelLink: { select: { thumbnailUrl: true } },
            },
          },
        },
      },
    },
  });

  const hasMore = rows.length > pageSize;
  const page = hasMore ? rows.slice(0, pageSize) : rows;

  // One extra query for the viewer's like state on this page.
  let likedIds = new Set<string>();
  if (opts.viewerId && page.length > 0) {
    const likes = await prisma.vidalyseLike.findMany({
      where: { userId: opts.viewerId, publicVideoId: { in: page.map((r) => r.id) } },
      select: { publicVideoId: true },
    });
    likedIds = new Set(likes.map((l) => l.publicVideoId));
  }

  const items: FeedItem[] = page.map((r) => {
    const fromYoutube = r.source === "youtube";
    return {
      publicId: r.publicId,
      title: r.title ?? "",
      summary: r.summary,
      thumbnailUrl: fromYoutube
        ? r.thumbnailUrl // YouTube CDN URL, load directly
        : r.thumbnailUrl
          ? `/api/community/${r.publicId}/thumbnail`
          : null,
      publishedAt: (r.publishedAt ?? r.createdAt).toISOString(),
      youtubeVideoId: r.youtubeVideoId,
      fromYoutube,
      likeCount: r._count.likes,
      likedByViewer: likedIds.has(r.id),
      creator: {
        handle: r.user.publicProfile?.handle ?? "",
        displayName: r.user.publicProfile?.displayName ?? null,
        avatarUrl:
          r.user.publicProfile?.avatarUrl ?? r.user.publicProfile?.youtubeChannelLink?.thumbnailUrl ?? null,
      },
    };
  });

  return {
    items,
    nextCursor: hasMore ? page[page.length - 1].publicId : null,
  };
}
