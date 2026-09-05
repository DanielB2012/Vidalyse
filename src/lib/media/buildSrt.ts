import type { TranscriptSegment } from "@/lib/pipeline/types";

function srtTime(ms: number): string {
  const clamped = Math.max(0, Math.round(ms));
  const h = Math.floor(clamped / 3_600_000);
  const m = Math.floor((clamped % 3_600_000) / 60_000);
  const s = Math.floor((clamped % 60_000) / 1000);
  const millis = clamped % 1000;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(millis).padStart(3, "0")}`;
}

// Builds an SRT covering [clipStartMs, clipEndMs], re-based to 0. Returns null
// when no segment overlaps the window — so the caller can refuse to burn
// subtitles rather than invent them (§8).
export function buildSrtForClip(
  segments: TranscriptSegment[],
  clipStartMs: number,
  clipEndMs: number
): string | null {
  const cues = segments
    .filter((s) => s.endTimestampMs > clipStartMs && s.timestampMs < clipEndMs && s.text.trim())
    .map((s) => ({
      start: Math.max(0, s.timestampMs - clipStartMs),
      end: Math.min(clipEndMs - clipStartMs, s.endTimestampMs - clipStartMs),
      text: s.text.trim().replace(/\r?\n/g, " "),
    }))
    .filter((c) => c.end > c.start);

  if (cues.length === 0) return null;

  return (
    cues
      .map((c, i) => `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${c.text}\n`)
      .join("\n") + "\n"
  );
}
