import { getAuthorizedYoutubeClient } from "./client";

// Live YouTube search (search.list) — lets the community search find ANY video
// or channel on YouTube, not just Vidalyse members. search.list costs 100 quota
// units, so one call (mixed video+channel) per query, capped results, and only
// when the query is meaningful.

export interface YoutubeSearchVideo {
  videoId: string;
  title: string;
  channelId: string;
  channelTitle: string;
  thumbnailUrl: string | null;
  publishedAt: string | null;
}

export interface YoutubeSearchChannel {
  channelId: string;
  title: string;
  thumbnailUrl: string | null;
  description: string | null;
}

export interface YoutubeSearchResults {
  videos: YoutubeSearchVideo[];
  channels: YoutubeSearchChannel[];
}

const EMPTY: YoutubeSearchResults = { videos: [], channels: [] };

// search.list snippet titles/descriptions come HTML-escaped ("&#39;", "&amp;"…).
function unescapeHtml(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

export async function searchYoutube(
  userId: string,
  query: string,
  maxResults = 20
): Promise<YoutubeSearchResults> {
  const q = query.trim();
  if (q.length < 2) return EMPTY;

  const youtube = await getAuthorizedYoutubeClient(userId);
  if (!youtube) return EMPTY;

  try {
    const res = await youtube.search.list({
      part: ["snippet"],
      q,
      type: ["video", "channel"],
      maxResults,
      safeSearch: "moderate",
    });

    const videos: YoutubeSearchVideo[] = [];
    const channels: YoutubeSearchChannel[] = [];

    for (const item of res.data.items ?? []) {
      const sn = item.snippet;
      if (item.id?.videoId && sn) {
        videos.push({
          videoId: item.id.videoId,
          title: unescapeHtml(sn.title ?? ""),
          channelId: sn.channelId ?? "",
          channelTitle: unescapeHtml(sn.channelTitle ?? ""),
          thumbnailUrl: sn.thumbnails?.medium?.url ?? sn.thumbnails?.default?.url ?? null,
          publishedAt: sn.publishedAt ?? null,
        });
      } else if (item.id?.channelId && sn) {
        channels.push({
          channelId: item.id.channelId,
          title: unescapeHtml(sn.title ?? sn.channelTitle ?? ""),
          thumbnailUrl: sn.thumbnails?.medium?.url ?? sn.thumbnails?.default?.url ?? null,
          description: sn.description ? unescapeHtml(sn.description) : null,
        });
      }
    }
    return { videos, channels };
  } catch (err) {
    console.warn("[community] YouTube search failed", err);
    return EMPTY;
  }
}
