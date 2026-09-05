import { extractEmbeddedSubtitles } from "@/lib/media/ffmpeg";
import { parseSubtitleFile } from "@/lib/media/subtitles";
import { findDownloadedSubtitleFile } from "@/lib/youtube/download";
import type { StructuredEvent } from "@/lib/ai/providers/types";
import type { MergedAnalysis, TranscriptSegment } from "./types";

export type TranscriptSource = NonNullable<MergedAnalysis["transcriptSource"]>;

export interface ResolvedTranscript {
  segments: TranscriptSegment[];
  source: TranscriptSource;
}

// Tries the creator's OWN captions before falling back to Whisper (§ user ask:
// local ASR isn't reliable enough — use real subtitles when they exist):
//   1. a text subtitle track embedded in the video file
//   2. a sidecar .srt fetched by yt-dlp for a YouTube download
// Returns null when neither is present; the pipeline then runs Whisper.
export async function resolveAuthoredTranscript(args: {
  videoPath: string;
  tmpDir: string;
  isYoutubeDownload: boolean;
}): Promise<ResolvedTranscript | null> {
  try {
    const embedded = await extractEmbeddedSubtitles(args.videoPath, args.tmpDir);
    if (embedded) {
      const segments = await parseSubtitleFile(embedded);
      if (segments.length >= 3) return { segments, source: "author_subtitles_embedded" };
    }
  } catch {
    // fall through
  }

  if (args.isYoutubeDownload) {
    try {
      const sidecar = await findDownloadedSubtitleFile(args.videoPath);
      if (sidecar) {
        const segments = await parseSubtitleFile(sidecar);
        if (segments.length >= 3) return { segments, source: "author_subtitles_sidecar" };
      }
    } catch {
      // fall through
    }
  }

  return null;
}

// Last-resort reconstruction from the Vision model's `on_screen_text` events —
// only useful for burned-in subtitles, and always partial (frames are sparse).
// Used only when there is no authored transcript AND Whisper produced nothing.
export function transcriptFromOnScreenText(
  visionEvents: StructuredEvent[] | null,
  durationMs: number
): TranscriptSegment[] | null {
  const texts = (visionEvents ?? [])
    .filter((e) => e.type === "on_screen_text" && e.description.trim().length > 1)
    .sort((a, b) => a.timestampMs - b.timestampMs);
  if (texts.length < 4) return null;

  return texts.map((e, i) => ({
    timestampMs: e.timestampMs,
    endTimestampMs: texts[i + 1] ? texts[i + 1].timestampMs : Math.min(durationMs, e.timestampMs + 4000),
    text: e.description.trim(),
  }));
}
