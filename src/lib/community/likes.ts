import { prisma } from "@/lib/prisma";
import { isFeedVisible } from "./visibility";

// Likes on community publications (§4 / §13 Phase B). One like per user per
// publication — enforced by @@unique([userId, publicVideoId]) on VidalyseLike
// AND re-checked here so a lost race is a no-op, not a 500. The target must be a
// currently-visible publication (published + owner profile public); you can't
// like something that isn't in the feed.

export type ToggleLikeResult =
  | { ok: true; liked: boolean; count: number }
  | { ok: false; error: "not_found" };

export async function toggleLike(userId: string, publicId: string): Promise<ToggleLikeResult> {
  const pv = await prisma.publicVideo.findUnique({
    where: { publicId },
    select: {
      id: true,
      isPublic: true,
      youtubePublic: true,
      user: { select: { publicProfile: { select: { isPublic: true } } } },
    },
  });
  if (
    !pv ||
    !isFeedVisible({
      publicationIsPublic: pv.isPublic,
      youtubePublic: pv.youtubePublic,
      ownerProfileIsPublic: pv.user.publicProfile?.isPublic ?? false,
    })
  ) {
    return { ok: false, error: "not_found" };
  }

  const existing = await prisma.vidalyseLike.findUnique({
    where: { userId_publicVideoId: { userId, publicVideoId: pv.id } },
    select: { id: true },
  });

  if (existing) {
    await prisma.vidalyseLike.delete({ where: { id: existing.id } });
  } else {
    try {
      await prisma.vidalyseLike.create({ data: { userId, publicVideoId: pv.id } });
    } catch (err) {
      // Only swallow the unique-constraint race (double click) — the row is
      // already there, and we report the real state from the count below.
      // Anything else (FK violation, DB error) must surface.
      const code = (err as { code?: string })?.code;
      if (code !== "P2002") throw err;
    }
  }

  const count = await prisma.vidalyseLike.count({ where: { publicVideoId: pv.id } });
  return { ok: true, liked: !existing, count };
}

// Like a raw YouTube video (from search / the yt watch page). Only possible
// when the video's channel belongs to a Vidalyse creator with a PUBLIC profile
// — then we mirror the video into a PublicVideo row on the fly and like that.
// Otherwise we tell the caller the creator isn't on Vidalyse.
export type ToggleYoutubeLikeResult =
  | { ok: true; liked: boolean; count: number }
  | { ok: false; reason: "creator_not_on_vidalyse" | "not_found" };

export async function toggleYoutubeLike(
  userId: string,
  input: { youtubeVideoId: string; channelId: string; title?: string | null; thumbnailUrl?: string | null }
): Promise<ToggleYoutubeLikeResult> {
  if (!input.channelId) return { ok: false, reason: "creator_not_on_vidalyse" };

  const chan = await prisma.channel.findFirst({
    where: { youtubeId: input.channelId },
    select: { userId: true, user: { select: { publicProfile: { select: { isPublic: true } } } } },
  });
  if (!chan || !chan.user.publicProfile?.isPublic) {
    return { ok: false, reason: "creator_not_on_vidalyse" };
  }

  // Ensure a PublicVideo row for this upload (don't clobber an existing one).
  const pv = await prisma.publicVideo.upsert({
    where: { userId_youtubeVideoId: { userId: chan.userId, youtubeVideoId: input.youtubeVideoId } },
    update: {},
    create: {
      userId: chan.userId,
      youtubeVideoId: input.youtubeVideoId,
      source: "youtube",
      title: input.title?.slice(0, 300) ?? null,
      thumbnailUrl: input.thumbnailUrl ?? null,
      youtubePublic: true,
      publishedAt: new Date(),
    },
    select: { publicId: true },
  });

  const res = await toggleLike(userId, pv.publicId);
  if (!res.ok) return { ok: false, reason: "not_found" };
  return res;
}

// Like state for an arbitrary set of publications (internal ids), for hydrating
// a list. Kept separate from listCommunityFeed so a profile page can reuse it.
export async function likedPublicVideoIds(
  userId: string,
  publicVideoIds: string[]
): Promise<Set<string>> {
  if (publicVideoIds.length === 0) return new Set();
  const rows = await prisma.vidalyseLike.findMany({
    where: { userId, publicVideoId: { in: publicVideoIds } },
    select: { publicVideoId: true },
  });
  return new Set(rows.map((r) => r.publicVideoId));
}
