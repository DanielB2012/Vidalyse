const VIDEO_ID_RE = /^[\w-]{11}$/;

const ID_PATH_SEGMENTS = new Set(["shorts", "embed", "live", "v"]);

/**
 * Accepts anything a user might paste for a YouTube video — a full URL in any
 * of YouTube's link shapes (watch, youtu.be, shorts, embed, live, mobile,
 * nocookie), or a bare 11-char video id — and returns just the video id.
 */
export function extractYoutubeVideoId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (VIDEO_ID_RE.test(trimmed)) return trimmed;

  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }

  const host = url.hostname.toLowerCase().replace(/^(www\.|m\.)/, "");

  if (host === "youtu.be") {
    const id = url.pathname.split("/").filter(Boolean)[0];
    return id && VIDEO_ID_RE.test(id) ? id : null;
  }

  if (host === "youtube.com" || host === "youtube-nocookie.com") {
    const v = url.searchParams.get("v");
    if (v && VIDEO_ID_RE.test(v)) return v;

    const parts = url.pathname.split("/").filter(Boolean);
    const idx = parts.findIndex((p) => ID_PATH_SEGMENTS.has(p));
    if (idx !== -1 && parts[idx + 1] && VIDEO_ID_RE.test(parts[idx + 1])) return parts[idx + 1];
  }

  return null;
}
