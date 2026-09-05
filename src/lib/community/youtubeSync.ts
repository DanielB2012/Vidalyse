import { prisma } from "@/lib/prisma";
import { fetchPublishedVideos, type PublishedVideoSummary } from "@/lib/youtube/uploads";

// Auto-mirror the creator's PUBLIC YouTube uploads into PublicVideo rows so
// EVERY public YouTube video also shows up in the community — no manual publish.
// Unlisted and private are never mirrored.
//
// Runs lazily on the owner's own /community visit (needs their OAuth token, so
// it can't run for a visitor). Walks the whole uploads playlist up to a hard
// cap; when the full channel was scanned, reconciliation is global (a video
// that went private/unlisted/deleted is un-mirrored), otherwise it stays
// bounded to the scanned window.

const SYNC_TTL_MS = 10 * 60 * 1000; // re-sync at most every 10 min
const MAX_PAGES = 20; // hard ceiling: 20 × 50 = 1000 uploads
const PER_PAGE = 50;

export async function maybeSyncYoutubePublications(userId: string): Promise<void> {
  const profile = await prisma.publicProfile.findUnique({
    where: { userId },
    select: { autoIncludeYoutube: true, youtubeSyncedAt: true, youtubeChannelLinkId: true },
  });
  if (!profile || !profile.autoIncludeYoutube) return;
  if (profile.youtubeSyncedAt && Date.now() - profile.youtubeSyncedAt.getTime() < SYNC_TTL_MS) return;

  try {
    await syncYoutubePublications(userId, profile.youtubeChannelLinkId ?? undefined);
  } catch (err) {
    // A YouTube API hiccup (expired token, quota) must never break the page.
    console.warn("[community] YouTube publication sync failed", err);
  }
}

export async function syncYoutubePublications(
  userId: string,
  linkId?: string
): Promise<{ mirrored: number }> {
  // 1. Walk the whole uploads playlist (up to the hard cap).
  const uploads: PublishedVideoSummary[] = [];
  let pageToken: string | undefined;
  let pages = 0;
  let fullChannel = false;
  for (; pages < MAX_PAGES; pages++) {
    const page = await fetchPublishedVideos(userId, pageToken, PER_PAGE, linkId);
    if (!page) return { mirrored: 0 }; // no YouTube client (not connected)
    uploads.push(...page.videos);
    if (!page.nextPageToken) {
      fullChannel = true;
      break;
    }
    pageToken = page.nextPageToken;
  }

  const publicOnes = uploads.filter((v) => v.privacyStatus === "public");
  const publicIds = new Set(publicOnes.map((v) => v.videoId));

  // If we didn't reach the end of the channel, only reconcile within the
  // window we actually scanned (don't un-mirror what we simply didn't re-check).
  const scannedTimes = uploads
    .map((v) => (v.publishedAt ? new Date(v.publishedAt).getTime() : null))
    .filter((t): t is number => t != null);
  const windowStart =
    fullChannel || scannedTimes.length === 0 ? null : new Date(Math.min(...scannedTimes));

  // 2. Upsert each public upload. Never touch summary/payload/isPublic — those
  //    belong to an explicit publish. `source` is only set on create.
  for (const v of publicOnes) {
    const publishedAt = v.publishedAt ? new Date(v.publishedAt) : null;
    await prisma.publicVideo.upsert({
      where: { userId_youtubeVideoId: { userId, youtubeVideoId: v.videoId } },
      create: {
        userId,
        youtubeVideoId: v.videoId,
        source: "youtube",
        title: v.title,
        thumbnailUrl: v.thumbnailUrl,
        durationSec: v.durationSec,
        youtubePublic: true,
        publishedAt,
      },
      update: {
        youtubePublic: true,
        title: v.title,
        thumbnailUrl: v.thumbnailUrl,
        durationSec: v.durationSec,
        ...(publishedAt ? { publishedAt } : {}),
      },
    });
  }

  // 3. Reconcile: any row we currently mark youtubePublic, inside the scanned
  //    window, whose video is no longer in the public set → not public anymore.
  const stale = await prisma.publicVideo.findMany({
    where: {
      userId,
      youtubePublic: true,
      youtubeVideoId: { notIn: [...publicIds] },
      ...(windowStart ? { publishedAt: { gte: windowStart } } : {}),
    },
    select: { id: true, youtubeVideoId: true },
  });
  const staleInWindow = stale.filter((r) => r.youtubeVideoId && !publicIds.has(r.youtubeVideoId));
  if (staleInWindow.length) {
    await prisma.publicVideo.updateMany({
      where: { id: { in: staleInWindow.map((r) => r.id) } },
      data: { youtubePublic: false },
    });
  }

  // 4. Drop auto-only rows that are now invisible (mirrored, never hand-published,
  //    no longer public on YouTube).
  await prisma.publicVideo.deleteMany({
    where: { userId, source: "youtube", isPublic: false, youtubePublic: false },
  });

  await prisma.publicProfile.update({
    where: { userId },
    data: { youtubeSyncedAt: new Date() },
  });

  return { mirrored: publicOnes.length };
}
