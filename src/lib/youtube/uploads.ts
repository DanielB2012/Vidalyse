import { getAuthorizedYoutubeClient } from "./client";
import { parseIsoDuration } from "./duration";
import { prisma } from "@/lib/prisma";

// Every video published on the channel, paginated straight from its real
// "uploads" playlist (channels.list → contentDetails.relatedPlaylists.uploads)
// — the same quota-efficient path YouTube itself uses, not search.list.
export type PublishedContentType = "video" | "short" | "live";
export type PrivacyStatus = "public" | "unlisted" | "private";

const CONTENT_TYPES: PublishedContentType[] = ["video", "short", "live"];
const PRIVACY_STATUSES: PrivacyStatus[] = ["public", "unlisted", "private"];

export interface PublishedVideoSummary {
  videoId: string;
  title: string;
  thumbnailUrl: string | null;
  publishedAt: string | null;
  durationSec: number | null;
  viewCount: number | null;
  likeCount: number | null;
  commentCount: number | null;
  contentType: PublishedContentType;
  privacyStatus: PrivacyStatus | null;
}

export interface PublishedVideosPage {
  videos: PublishedVideoSummary[];
  nextPageToken: string | null;
  prevPageToken: string | null;
}

// Only videos short enough to even be Shorts-eligible get the extra check
// below — everything else is trivially "video", so most of a channel's
// uploads never pay the network cost.
const SHORTS_ELIGIBLE_MAX_SEC = 180;

async function fetchOEmbedDimensions(videoId: string): Promise<{ width: number; height: number } | null> {
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl)}&format=json`;
  try {
    const res = await fetch(oembedUrl, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) {
      console.warn(`[content-classify] oEmbed HTTP ${res.status} for ${videoId}`);
      return null;
    }
    const data = (await res.json()) as { width?: number; height?: number };
    if (!data.width || !data.height) {
      console.warn(`[content-classify] oEmbed missing width/height for ${videoId}:`, data);
      return null;
    }
    return { width: data.width, height: data.height };
  } catch (err) {
    console.warn(`[content-classify] oEmbed fetch failed for ${videoId}:`, err);
    return null;
  }
}

async function isVerticalViaOEmbed(videoId: string): Promise<boolean | null> {
  // One retry before giving up — a transient timeout here must never fall
  // back to a duration guess, which is exactly what produced past false
  // positives (a short-duration landscape video tagged as a Short).
  const dims = (await fetchOEmbedDimensions(videoId)) ?? (await fetchOEmbedDimensions(videoId));
  if (dims) console.log(`[content-classify] ${videoId}: oEmbed ${dims.width}x${dims.height}`);
  return dims ? dims.height > dims.width : null;
}

// Live streams are unambiguous — "liveStreamingDetails" is only ever present
// on a video that was (or is) broadcast live, real API data, never guessed.
// Shorts have NO official Data API flag, so duration alone is not enough
// (YouTube raised the Shorts limit to 3 minutes, and plenty of ordinary
// videos are under a minute too). The reliable signal is the video's own
// aspect ratio — Shorts are vertical/square, regular videos are 16:9 — read
// from YouTube's public oEmbed endpoint, which reports the real player
// width/height for that video, not a synthetic thumbnail size.
async function resolveContentType(
  hasLiveDetails: boolean,
  durationSec: number | null,
  videoId: string
): Promise<PublishedContentType> {
  if (hasLiveDetails) {
    console.log(`[content-classify] ${videoId}: live (liveStreamingDetails present)`);
    return "live";
  }
  if (durationSec === null || durationSec > SHORTS_ELIGIBLE_MAX_SEC) {
    console.log(`[content-classify] ${videoId}: video (duration ${durationSec}s > ${SHORTS_ELIGIBLE_MAX_SEC}s or unknown)`);
    return "video";
  }
  const vertical = await isVerticalViaOEmbed(videoId);
  // oEmbed is the only real signal we have — if both attempts fail (vertical
  // is null), default to "video" (the far more common case) rather than
  // guess "short" from duration again.
  return vertical ? "short" : "video";
}

interface DetailInfo {
  duration?: string | null;
  viewCount?: string | null;
  likeCount?: string | null;
  commentCount?: string | null;
  hasLiveDetails: boolean;
  privacyStatus?: string | null;
}

type YoutubeClient = NonNullable<Awaited<ReturnType<typeof getAuthorizedYoutubeClient>>>;

async function fetchDetailsMap(youtube: YoutubeClient, videoIds: string[]): Promise<Map<string, DetailInfo>> {
  const detailsById = new Map<string, DetailInfo>();
  if (videoIds.length === 0) return detailsById;

  const detailsRes = await youtube.videos.list({
    part: ["statistics", "contentDetails", "liveStreamingDetails", "status"],
    id: videoIds,
  });
  for (const item of detailsRes.data.items ?? []) {
    if (!item.id) continue;
    detailsById.set(item.id, {
      duration: item.contentDetails?.duration,
      viewCount: item.statistics?.viewCount,
      likeCount: item.statistics?.likeCount,
      commentCount: item.statistics?.commentCount,
      hasLiveDetails: Boolean(item.liveStreamingDetails),
      privacyStatus: item.status?.privacyStatus,
    });
  }
  return detailsById;
}

// Defaults an unrecognized/missing privacy status to "public" — YouTube
// always returns one for anything the owner can see, so this only matters
// for the rare malformed response, and "public" is the least-surprising
// bucket for it (never leaves a video invisible to every visibility filter).
function toPrivacyStatus(raw: string | null | undefined): PrivacyStatus {
  return raw === "unlisted" || raw === "private" ? raw : "public";
}

export async function fetchPublishedVideos(
  userId: string,
  pageToken?: string,
  maxResults = 30,
  linkId?: string
): Promise<PublishedVideosPage | null> {
  const youtube = await getAuthorizedYoutubeClient(userId, linkId);
  if (!youtube) return null;

  const channelRes = await youtube.channels.list({ part: ["contentDetails"], mine: true });
  const uploadsPlaylistId = channelRes.data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploadsPlaylistId) return { videos: [], nextPageToken: null, prevPageToken: null };

  const itemsRes = await youtube.playlistItems.list({
    playlistId: uploadsPlaylistId,
    part: ["snippet"],
    maxResults,
    pageToken,
  });

  const items = itemsRes.data.items ?? [];
  const videoIds = items
    .map((it) => it.snippet?.resourceId?.videoId)
    .filter((id): id is string => Boolean(id));

  const detailsById = await fetchDetailsMap(youtube, videoIds);

  const videos = await Promise.all(
    items.map(async (it): Promise<PublishedVideoSummary | null> => {
      const videoId = it.snippet?.resourceId?.videoId;
      if (!videoId) return null;
      const details = detailsById.get(videoId);
      const durationSec = parseIsoDuration(details?.duration);
      return {
        videoId,
        title: it.snippet?.title ?? "Vidéo",
        thumbnailUrl: it.snippet?.thumbnails?.medium?.url ?? null,
        publishedAt: it.snippet?.publishedAt ?? null,
        durationSec,
        viewCount: details?.viewCount ? Number(details.viewCount) : null,
        likeCount: details?.likeCount ? Number(details.likeCount) : null,
        commentCount: details?.commentCount ? Number(details.commentCount) : null,
        contentType: await resolveContentType(details?.hasLiveDetails ?? false, durationSec, videoId),
        privacyStatus: toPrivacyStatus(details?.privacyStatus),
      };
    })
  );

  return {
    videos: videos.filter((v): v is PublishedVideoSummary => v !== null),
    nextPageToken: itemsRes.data.nextPageToken ?? null,
    prevPageToken: itemsRes.data.prevPageToken ?? null,
  };
}

// Every (content type × visibility) combination, so the UI can answer
// "how many Shorts, just the public ones?" without a separate scan per
// filter — one pass tallies all nine cells at once.
export type ContentPrivacyMatrix = Record<PublishedContentType, Record<PrivacyStatus, number>>;

function emptyMatrix(): ContentPrivacyMatrix {
  return {
    video: { public: 0, unlisted: 0, private: 0 },
    short: { public: 0, unlisted: 0, private: 0 },
    live: { public: 0, unlisted: 0, private: 0 },
  };
}

function addMatrix(a: ContentPrivacyMatrix, b: ContentPrivacyMatrix): ContentPrivacyMatrix {
  const out = emptyMatrix();
  for (const type of CONTENT_TYPES) {
    for (const privacy of PRIVACY_STATUSES) {
      out[type][privacy] = a[type][privacy] + b[type][privacy];
    }
  }
  return out;
}

// Sums a matrix down to per-type totals, optionally restricted to one
// visibility — this is what powers the tab counts matching the visibility
// filter selected on the page.
export function sumMatrixByType(
  matrix: ContentPrivacyMatrix,
  visibility?: PrivacyStatus
): Record<PublishedContentType, number> {
  const out: Record<PublishedContentType, number> = { video: 0, short: 0, live: 0 };
  for (const type of CONTENT_TYPES) {
    out[type] = visibility
      ? matrix[type][visibility]
      : matrix[type].public + matrix[type].unlisted + matrix[type].private;
  }
  return out;
}

export interface ChannelTypeBreakdown {
  matrix: ContentPrivacyMatrix;
  scanned: number;
  totalOnChannel: number | null;
  capped: boolean;
}

// Real per-type totals require classifying every upload — YouTube's API
// gives a grand total (all types combined, public only) but never a
// per-type/per-visibility count, so this is the only honest way to get one.
// Capped so a huge archive can't hang the request forever; when capped,
// `scanned < totalOnChannel` and the caller must say so rather than imply
// this is the whole channel.
const BREAKDOWN_SCAN_CAP = 500;

interface ScanResult {
  matrix: ContentPrivacyMatrix;
  scanned: number;
  capped: boolean;
  newestPublishedAt: string | null;
}

async function scanUploads(
  youtube: YoutubeClient,
  uploadsPlaylistId: string,
  opts: { cap: number; stopAt?: string }
): Promise<ScanResult> {
  const matrix = emptyMatrix();
  let scanned = 0;
  let pageToken: string | undefined;
  let capped = false;
  let newestPublishedAt: string | null = null;
  let stopped = false;

  do {
    const itemsRes = await youtube.playlistItems.list({
      playlistId: uploadsPlaylistId,
      part: ["snippet"],
      maxResults: 50,
      pageToken,
    });
    let items = itemsRes.data.items ?? [];

    if (opts.stopAt) {
      // Compare as real timestamps, not raw strings: YouTube's publishedAt
      // has no milliseconds ("...30Z"), while a value round-tripped through
      // Date.toISOString() always does ("...30.000Z") — lexicographic
      // comparison of those two formats is wrong (the millisecond-bearing
      // string sorts *before* the plain one even for the same instant),
      // which made the newest video look "new" again on every single
      // reload and get re-counted — the +1-per-page-view bug.
      const stopAtMs = new Date(opts.stopAt).getTime();
      const stopIndex = items.findIndex((it) => {
        const publishedAt = it.snippet?.publishedAt;
        return publishedAt ? new Date(publishedAt).getTime() <= stopAtMs : false;
      });
      if (stopIndex !== -1) {
        items = items.slice(0, stopIndex);
        stopped = true;
      }
    }

    if (scanned === 0 && items[0]?.snippet?.publishedAt) {
      newestPublishedAt = items[0].snippet.publishedAt;
    }

    const videoIds = items
      .map((it) => it.snippet?.resourceId?.videoId)
      .filter((id): id is string => Boolean(id));
    const detailsById = await fetchDetailsMap(youtube, videoIds);

    await Promise.all(
      videoIds.map(async (videoId) => {
        const details = detailsById.get(videoId);
        const durationSec = parseIsoDuration(details?.duration);
        const type = await resolveContentType(details?.hasLiveDetails ?? false, durationSec, videoId);
        const privacy = toPrivacyStatus(details?.privacyStatus);
        matrix[type][privacy]++;
      })
    );
    scanned += videoIds.length;

    pageToken = itemsRes.data.nextPageToken ?? undefined;
    if (stopped) break;
    if (scanned >= opts.cap) {
      capped = Boolean(pageToken);
      break;
    }
  } while (pageToken);

  return { matrix, scanned, capped, newestPublishedAt };
}

export async function computeChannelTypeBreakdown(userId: string): Promise<ChannelTypeBreakdown | null> {
  const youtube = await getAuthorizedYoutubeClient(userId);
  if (!youtube) return null;

  const channelRes = await youtube.channels.list({ part: ["contentDetails", "statistics"], mine: true });
  const channelItem = channelRes.data.items?.[0];
  const uploadsPlaylistId = channelItem?.contentDetails?.relatedPlaylists?.uploads;
  const totalOnChannel = channelItem?.statistics?.videoCount ? Number(channelItem.statistics.videoCount) : null;

  if (!uploadsPlaylistId) {
    return { matrix: emptyMatrix(), scanned: 0, totalOnChannel, capped: false };
  }

  const result = await scanUploads(youtube, uploadsPlaylistId, { cap: BREAKDOWN_SCAN_CAP });
  return { matrix: result.matrix, scanned: result.scanned, totalOnChannel, capped: result.capped };
}

// Cached version (spec: "enregistre le scan, puis détecte les nouvelles
// vidéos plutôt qu'un nouveau scan complet"). First call for a channel does
// the full capped scan and persists it; every call after only classifies
// uploads published since the cached `newestPublishedAt`, then adds them to
// the stored matrix — a channel that hasn't published anything new returns
// instantly with zero extra API calls beyond the "any new videos?" check.
export async function getOrUpdateChannelTypeBreakdown(userId: string): Promise<ChannelTypeBreakdown | null> {
  const youtube = await getAuthorizedYoutubeClient(userId);
  if (!youtube) return null;

  const channelRes = await youtube.channels.list({ part: ["contentDetails", "statistics"], mine: true });
  const channelItem = channelRes.data.items?.[0];
  const uploadsPlaylistId = channelItem?.contentDetails?.relatedPlaylists?.uploads;
  const totalOnChannel = channelItem?.statistics?.videoCount ? Number(channelItem.statistics.videoCount) : null;

  if (!uploadsPlaylistId) {
    return { matrix: emptyMatrix(), scanned: 0, totalOnChannel, capped: false };
  }

  const cached = await prisma.channelContentCache.findUnique({ where: { userId } });

  if (!cached) {
    const result = await scanUploads(youtube, uploadsPlaylistId, { cap: BREAKDOWN_SCAN_CAP });
    await prisma.channelContentCache.upsert({
      where: { userId },
      create: {
        userId,
        matrix: result.matrix,
        scannedCount: result.scanned,
        totalOnChannel,
        capped: result.capped,
        newestPublishedAt: result.newestPublishedAt ? new Date(result.newestPublishedAt) : null,
      },
      update: {},
    });
    return { matrix: result.matrix, scanned: result.scanned, totalOnChannel, capped: result.capped };
  }

  // Incremental: classify only what's newer than the last scan.
  const stopAt = cached.newestPublishedAt?.toISOString();
  const delta = await scanUploads(youtube, uploadsPlaylistId, {
    // A capped incremental scan still needs a ceiling — a channel that
    // published hundreds of videos since the last visit shouldn't hang the
    // page either, and gets folded in as "capped" like the initial scan.
    cap: BREAKDOWN_SCAN_CAP,
    stopAt,
  });

  const mergedMatrix = addMatrix(cached.matrix as ContentPrivacyMatrix, delta.matrix);
  const merged = {
    matrix: mergedMatrix,
    scanned: cached.scannedCount + delta.scanned,
    capped: cached.capped || delta.capped,
  };

  if (delta.scanned > 0) {
    await prisma.channelContentCache.update({
      where: { userId },
      data: {
        matrix: merged.matrix,
        scannedCount: merged.scanned,
        totalOnChannel,
        capped: merged.capped,
        newestPublishedAt: delta.newestPublishedAt ? new Date(delta.newestPublishedAt) : cached.newestPublishedAt,
      },
    });
  }

  return { ...merged, totalOnChannel };
}
