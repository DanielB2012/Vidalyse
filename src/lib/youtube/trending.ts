import { getAuthorizedYoutubeClient } from "./client";

// "What's popular right now" — YouTube's own mostPopular chart (videos.list,
// 1 quota unit). Used to seed the /community home with fresh recommendations.

export interface TrendingVideo {
  videoId: string;
  title: string;
  channelId: string;
  channelTitle: string;
  thumbnailUrl: string | null;
  publishedAt: string | null;
}

export async function fetchTrending(
  userId: string,
  opts: { regionCode?: string; max?: number } = {}
): Promise<TrendingVideo[]> {
  const youtube = await getAuthorizedYoutubeClient(userId);
  if (!youtube) return [];

  try {
    const res = await youtube.videos.list({
      part: ["snippet"],
      chart: "mostPopular",
      regionCode: opts.regionCode ?? "FR",
      maxResults: opts.max ?? 40,
    });
    return (res.data.items ?? [])
      .map((v): TrendingVideo | null => {
        if (!v.id || !v.snippet) return null;
        return {
          videoId: v.id,
          title: v.snippet.title ?? "",
          channelId: v.snippet.channelId ?? "",
          channelTitle: v.snippet.channelTitle ?? "",
          thumbnailUrl:
            v.snippet.thumbnails?.medium?.url ?? v.snippet.thumbnails?.default?.url ?? null,
          publishedAt: v.snippet.publishedAt ?? null,
        };
      })
      .filter((v): v is TrendingVideo => v !== null);
  } catch (err) {
    console.warn("[community] trending fetch failed", err);
    return [];
  }
}
