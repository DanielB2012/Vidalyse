import { getAuthorizedYoutubeAnalyticsClient, getAuthorizedYoutubeClient } from "./client";
import { parseIsoDuration } from "./duration";

// What's real vs. not, verified against developers.google.com/youtube/analytics/metrics
// before writing this (spec §106): views, watch time, average view
// duration/percentage, likes/comments/shares, subscribers gained are all
// genuinely queryable via the YouTube Analytics API for any channel owner.
// "impressions" and "impressionsClickThroughRate" (thumbnail/title CTR) are
// NOT exposed by this public API at all — that's a Studio-only report, not
// something we forgot to wire up. Same for the full audience-retention curve
// (per-second/percentage graph) — only a single averageViewPercentage number
// per video is available here, not the curve itself.

export interface DailyPoint {
  date: string;
  views: number;
  estimatedMinutesWatched: number;
}

export interface VideoPerformance {
  videoId: string;
  title: string;
  thumbnailUrl: string | null;
  views: number;
  estimatedMinutesWatched: number;
  averageViewDurationSec: number;
  averageViewPercentage: number;
  likes: number;
  comments: number;
  subscribersGained: number;
}

export interface ChannelAnalyticsSummary {
  rangeStartDate: string;
  rangeEndDate: string;
  dailySeries: DailyPoint[];
  topVideos: VideoPerformance[];
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function fetchChannelAnalyticsSummary(
  userId: string
): Promise<ChannelAnalyticsSummary | null> {
  const analytics = await getAuthorizedYoutubeAnalyticsClient(userId);
  const youtube = await getAuthorizedYoutubeClient(userId);
  if (!analytics || !youtube) return null;

  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 28);
  const startDate = isoDate(start);
  const endDate = isoDate(end);

  const [dailyRes, videoRes] = await Promise.all([
    analytics.reports.query({
      ids: "channel==MINE",
      startDate,
      endDate,
      metrics: "views,estimatedMinutesWatched",
      dimensions: "day",
      sort: "day",
    }),
    analytics.reports.query({
      ids: "channel==MINE",
      startDate,
      endDate,
      metrics:
        "views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,likes,comments,subscribersGained",
      dimensions: "video",
      sort: "-views",
      maxResults: 10,
    }),
  ]);

  const dailySeries: DailyPoint[] = (dailyRes.data.rows ?? []).map((row) => ({
    date: String(row[0]),
    views: Number(row[1] ?? 0),
    estimatedMinutesWatched: Number(row[2] ?? 0),
  }));

  const videoRows = videoRes.data.rows ?? [];
  const videoIds = videoRows.map((row) => String(row[0]));

  let titlesById = new Map<string, { title: string; thumbnailUrl: string | null }>();
  if (videoIds.length > 0) {
    const detailsRes = await youtube.videos.list({ part: ["snippet"], id: videoIds });
    titlesById = new Map(
      (detailsRes.data.items ?? []).map((item) => [
        item.id!,
        {
          title: item.snippet?.title ?? "Vidéo",
          thumbnailUrl: item.snippet?.thumbnails?.medium?.url ?? null,
        },
      ])
    );
  }

  const topVideos: VideoPerformance[] = videoRows.map((row) => {
    const videoId = String(row[0]);
    const meta = titlesById.get(videoId);
    return {
      videoId,
      title: meta?.title ?? "Donnée indisponible",
      thumbnailUrl: meta?.thumbnailUrl ?? null,
      views: Number(row[1] ?? 0),
      estimatedMinutesWatched: Number(row[2] ?? 0),
      averageViewDurationSec: Number(row[3] ?? 0),
      averageViewPercentage: Number(row[4] ?? 0),
      likes: Number(row[5] ?? 0),
      comments: Number(row[6] ?? 0),
      subscribersGained: Number(row[7] ?? 0),
    };
  });

  return { rangeStartDate: startDate, rangeEndDate: endDate, dailySeries, topVideos };
}

export interface SingleVideoStats {
  videoId: string;
  title: string;
  thumbnailUrl: string | null;
  publishedAt: string | null;
  durationSec: number | null;
  // Data API — lifetime, always available if the video is public/unlisted.
  viewCount: number | null;
  likeCount: number | null;
  commentCount: number | null;
  // Analytics API — only available for videos owned by the authenticated
  // channel; null (not zero) when the query itself failed rather than
  // genuinely returning no data, so the UI never shows a fabricated 0.
  estimatedMinutesWatched: number | null;
  averageViewDurationSec: number | null;
  averageViewPercentage: number | null;
  subscribersGained: number | null;
}

// YouTube's own launch date — the same "since forever" lower bound Studio
// itself uses when you ask for a video's lifetime performance.
const YOUTUBE_EPOCH = "2005-02-14";

export async function fetchSingleVideoStats(userId: string, youtubeVideoId: string): Promise<SingleVideoStats | null> {
  const youtube = await getAuthorizedYoutubeClient(userId);
  if (!youtube) return null;

  const detailsRes = await youtube.videos.list({
    part: ["snippet", "statistics", "contentDetails"],
    id: [youtubeVideoId],
  });
  const item = detailsRes.data.items?.[0];
  if (!item) return null;

  const base: SingleVideoStats = {
    videoId: youtubeVideoId,
    title: item.snippet?.title ?? "Vidéo",
    thumbnailUrl: item.snippet?.thumbnails?.medium?.url ?? null,
    publishedAt: item.snippet?.publishedAt ?? null,
    durationSec: parseIsoDuration(item.contentDetails?.duration),
    viewCount: item.statistics?.viewCount ? Number(item.statistics.viewCount) : null,
    likeCount: item.statistics?.likeCount ? Number(item.statistics.likeCount) : null,
    commentCount: item.statistics?.commentCount ? Number(item.statistics.commentCount) : null,
    estimatedMinutesWatched: null,
    averageViewDurationSec: null,
    averageViewPercentage: null,
    subscribersGained: null,
  };

  // Analytics API only returns data for videos owned by this channel — a
  // linked video that isn't actually the user's own fails here, which is
  // expected and left as "donnée indisponible", never guessed.
  try {
    const analytics = await getAuthorizedYoutubeAnalyticsClient(userId);
    if (!analytics) return base;

    const res = await analytics.reports.query({
      ids: "channel==MINE",
      startDate: YOUTUBE_EPOCH,
      endDate: isoDate(new Date()),
      metrics: "estimatedMinutesWatched,averageViewDuration,averageViewPercentage,subscribersGained",
      filters: `video==${youtubeVideoId}`,
    });
    const row = res.data.rows?.[0];
    if (!row) return base;

    return {
      ...base,
      estimatedMinutesWatched: Number(row[0] ?? 0),
      averageViewDurationSec: Number(row[1] ?? 0),
      averageViewPercentage: Number(row[2] ?? 0),
      subscribersGained: Number(row[3] ?? 0),
    };
  } catch {
    return base;
  }
}

export interface VideoDailyPoint {
  date: string;
  views: number;
  estimatedMinutesWatched: number;
}

// Real per-day series for one video since it was published (capped to the
// last 2 years to keep the request bounded for very old videos) — the same
// Analytics API query as the channel summary, just filtered to one video.
// Only available for videos owned by this channel; null on any failure so
// the UI shows "donnée indisponible" instead of an empty-looking chart.
export async function fetchSingleVideoDailySeries(
  userId: string,
  youtubeVideoId: string,
  publishedAt: string | null
): Promise<VideoDailyPoint[] | null> {
  const analytics = await getAuthorizedYoutubeAnalyticsClient(userId);
  if (!analytics) return null;

  const twoYearsAgo = new Date();
  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
  const published = publishedAt ? new Date(publishedAt) : twoYearsAgo;
  const startDate = isoDate(published > twoYearsAgo ? published : twoYearsAgo);

  try {
    const res = await analytics.reports.query({
      ids: "channel==MINE",
      startDate,
      endDate: isoDate(new Date()),
      metrics: "views,estimatedMinutesWatched",
      dimensions: "day",
      sort: "day",
      filters: `video==${youtubeVideoId}`,
    });
    return (res.data.rows ?? []).map((row) => ({
      date: String(row[0]),
      views: Number(row[1] ?? 0),
      estimatedMinutesWatched: Number(row[2] ?? 0),
    }));
  } catch {
    return null;
  }
}
