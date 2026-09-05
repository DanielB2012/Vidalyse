import type { StructuredEvent } from "@/lib/ai/providers/types";
import type { EnrichedAnalysis } from "@/lib/analysis/types";

export interface TranscriptSegment {
  timestampMs: number;
  endTimestampMs: number;
  text: string;
}

export interface AudioDspSummary {
  meanVolumeDb: number | null;
  maxVolumeDb: number | null;
  silences: { startSec: number; endSec: number | null }[];
  // Real per-time momentary-loudness curve (EBU R128), ~1 point/s. Optional so
  // results produced before this field existed still parse.
  loudnessSeries?: { tSec: number; momentaryLufs: number }[];
}

// The common structure fusing every source (spec §7) — already shaped so
// YouTube Studio data (§24) can be added as a sibling key later without
// touching what's here.
export interface MergedAnalysis {
  video: {
    durationSec: number;
    width: number | null;
    height: number | null;
    fps: number | null;
  };
  audioDsp: AudioDspSummary | null;
  transcript: TranscriptSegment[] | null;
  // How `transcript` was obtained — the creator's own captions are trusted over
  // local ASR; "vision_ocr" is a partial reconstruction from on-screen text.
  transcriptSource?:
    | "author_subtitles_embedded"
    | "author_subtitles_sidecar"
    | "whisper_local"
    | "vision_ocr"
    | null;
  visionEvents: StructuredEvent[] | null;
  youtubeStats: Record<string, number | string | null> | null;
  textSynthesis: string | null;
  // 2-3 sentence AI recap shown under the video title — derived from the real
  // analysis data, never fabricated.
  summary: string | null;
  // Priority 3 — scene detection, timeline, highlight scoring, structure, hook,
  // cross-analysis and channel comparison. Optional so pre-P3 job results still
  // parse; each sub-field is independently nullable when its inputs were missing.
  enriched?: EnrichedAnalysis | null;
}
