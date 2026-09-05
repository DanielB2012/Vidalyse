import { prisma } from "@/lib/prisma";
import { isFeedVisible } from "./visibility";
import { getFollowState } from "./follow";

// One community video for the /community/watch/[publicId] page. Visible when the
// owner's profile is public AND the video is published or public on YouTube —
// or the viewer is the owner (private preview).

export interface WatchVideo {
  publicId: string;
  title: string;
  summary: string | null;
  youtubeVideoId: string | null;
  thumbnailUrl: string | null;
  fromYoutube: boolean;
  publishedAt: string;
  likeCount: number;
  likedByViewer: boolean;
  strengths: { text: string; atMs: number | null }[];
  creator: {
    userId: string;
    handle: string;
    displayName: string | null;
    avatarUrl: string | null;
    followerCount: number;
    viewerFollows: boolean;
    isSelf: boolean;
  };
}

export async function getWatchVideo(
  publicId: string,
  viewerId: string | null
): Promise<WatchVideo | null> {
  const row = await prisma.publicVideo.findUnique({
    where: { publicId },
    select: {
      id: true,
      publicId: true,
      userId: true,
      title: true,
      summary: true,
      youtubeVideoId: true,
      thumbnailUrl: true,
      source: true,
      isPublic: true,
      youtubePublic: true,
      publishedAt: true,
      createdAt: true,
      payload: true,
      _count: { select: { likes: true } },
      user: {
        select: {
          publicProfile: { select: { handle: true, displayName: true, avatarUrl: true, isPublic: true } },
        },
      },
    },
  });
  if (!row || !row.user.publicProfile) return null;

  const isOwner = viewerId != null && viewerId === row.userId;
  const visible =
    isFeedVisible({
      publicationIsPublic: row.isPublic,
      youtubePublic: row.youtubePublic,
      ownerProfileIsPublic: row.user.publicProfile.isPublic,
    }) || isOwner;
  if (!visible) return null;

  const likedByViewer = viewerId
    ? Boolean(
        await prisma.vidalyseLike.findUnique({
          where: { userId_publicVideoId: { userId: viewerId, publicVideoId: row.id } },
          select: { id: true },
        })
      )
    : false;

  const payload = (row.payload ?? null) as { strengths?: { text: string; atMs: number | null }[] } | null;
  const fromYoutube = row.source === "youtube";
  const follow = await getFollowState(viewerId, row.userId);

  return {
    publicId: row.publicId,
    title: row.title ?? "",
    summary: row.summary,
    youtubeVideoId: row.youtubeVideoId,
    thumbnailUrl: fromYoutube
      ? row.thumbnailUrl
      : row.thumbnailUrl
        ? `/api/community/${row.publicId}/thumbnail`
        : null,
    fromYoutube,
    publishedAt: (row.publishedAt ?? row.createdAt).toISOString(),
    likeCount: row._count.likes,
    likedByViewer,
    strengths: Array.isArray(payload?.strengths) ? payload!.strengths.slice(0, 6) : [],
    creator: {
      userId: row.userId,
      handle: row.user.publicProfile.handle,
      displayName: row.user.publicProfile.displayName,
      avatarUrl: row.user.publicProfile.avatarUrl,
      followerCount: follow.followerCount,
      viewerFollows: follow.following,
      isSelf: viewerId != null && viewerId === row.userId,
    },
  };
}
