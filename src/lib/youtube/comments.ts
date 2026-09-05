import { getAuthorizedYoutubeClient } from "./client";

export interface VideoComment {
  id: string;
  authorName: string;
  authorAvatarUrl: string | null;
  text: string;
  likeCount: number;
  publishedAt: string | null;
}

export type VideoCommentsResult =
  | { status: "ok"; comments: VideoComment[] }
  | { status: "disabled" } // real API state — comments turned off on that video
  | { status: "unavailable" }; // not authenticated, or the request itself failed

// Real top-level comments via commentThreads.list — public data, no extra
// scope beyond youtube.readonly. Never fabricated: a disabled/failed state is
// reported as such, not silently shown as "no comments".
export async function fetchVideoComments(
  userId: string,
  youtubeVideoId: string,
  maxResults = 20
): Promise<VideoCommentsResult> {
  const youtube = await getAuthorizedYoutubeClient(userId);
  if (!youtube) return { status: "unavailable" };

  try {
    const res = await youtube.commentThreads.list({
      videoId: youtubeVideoId,
      part: ["snippet"],
      order: "relevance",
      maxResults,
      textFormat: "plainText",
    });

    const comments: VideoComment[] = (res.data.items ?? []).map((thread) => {
      const top = thread.snippet?.topLevelComment?.snippet;
      return {
        id: thread.id ?? "",
        authorName: top?.authorDisplayName ?? "Utilisateur YouTube",
        authorAvatarUrl: top?.authorProfileImageUrl ?? null,
        text: top?.textDisplay ?? "",
        likeCount: top?.likeCount ?? 0,
        publishedAt: top?.publishedAt ?? null,
      };
    });

    return { status: "ok", comments };
  } catch (err) {
    // youtube.com shows "Comments are turned off" for this exact failure —
    // the API surfaces it as a 403 with reason "commentsDisabled". Read
    // defensively since the googleapis/gaxios error shape isn't guaranteed
    // to be identical across versions; anything else is reported as a
    // generic "unavailable" rather than guessed.
    const gaxiosErr = err as {
      errors?: { reason?: string }[];
      response?: { data?: { error?: { errors?: { reason?: string }[] } } };
    };
    const reason =
      gaxiosErr?.errors?.[0]?.reason ?? gaxiosErr?.response?.data?.error?.errors?.[0]?.reason;
    if (reason === "commentsDisabled") return { status: "disabled" };
    return { status: "unavailable" };
  }
}
