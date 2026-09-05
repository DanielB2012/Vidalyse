import type { StructuredEvent } from "@/lib/ai/providers/types";
import type { AudioDspSummary, TranscriptSegment } from "@/lib/pipeline/types";
import type { SceneDetectionResult, TimelineEvent } from "./types";

export interface TimelineInput {
  durationMs: number;
  transcript: TranscriptSegment[] | null;
  visionEvents: StructuredEvent[] | null;
  audioDsp: AudioDspSummary | null;
  sceneDetection: SceneDetectionResult | null;
}

const VISION_LABELS: Record<string, string> = {
  scene_change: "Changement de scène (Vision)",
  on_screen_text: "Texte à l'écran",
  object: "Objet / élément visuel",
  movement: "Mouvement notable",
  other: "Événement visuel",
};

// Merges every real, timestamped signal into one ordered list. Highlight and
// weak-moment markers are added later by `attachHighlightMarkers` once scoring
// has run — the architecture keeps them as just another event type so future
// scores slot in without touching consumers.
export function buildTimeline(input: TimelineInput): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  const clamp = (ms: number) => Math.max(0, Math.min(input.durationMs || ms, Math.round(ms)));

  input.transcript?.forEach((seg, i) => {
    const text = seg.text.trim();
    if (!text) return;
    events.push({
      id: `speech-${i}`,
      type: "speech",
      startMs: clamp(seg.timestampMs),
      endMs: clamp(seg.endTimestampMs || seg.timestampMs),
      label: text.length > 90 ? `${text.slice(0, 87)}…` : text,
      detail: null,
      source: "transcript",
      score: null,
    });
  });

  input.visionEvents?.forEach((ev, i) => {
    events.push({
      id: `vision-${i}`,
      type: "vision_event",
      startMs: clamp(ev.timestampMs),
      endMs: null,
      label: VISION_LABELS[ev.type] ?? VISION_LABELS.other,
      detail: ev.description,
      source: "vision_model",
      score: null,
    });
  });

  input.audioDsp?.silences.forEach((s, i) => {
    const startMs = clamp(s.startSec * 1000);
    const endMs = s.endSec != null ? clamp(s.endSec * 1000) : null;
    const durTxt = endMs != null ? ` (${((endMs - startMs) / 1000).toFixed(1)} s)` : "";
    events.push({
      id: `silence-${i}`,
      type: "silence",
      startMs,
      endMs,
      label: `Silence${durTxt}`,
      detail: "Détecté par analyse DSP (ffmpeg silencedetect), pas par IA.",
      source: "audio_dsp",
      score: null,
    });
  });

  // Loudest sustained moments from the real EBU R128 curve, relative to the
  // video's own median — only flagged when clearly above typical level.
  const loud = input.audioDsp?.loudnessSeries ?? [];
  if (loud.length >= 8) {
    const sorted = [...loud].map((p) => p.momentaryLufs).sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const peakThreshold = median + 4;
    let lastPeakSec = -Infinity;
    loud.forEach((p, i) => {
      if (p.momentaryLufs >= peakThreshold && p.tSec - lastPeakSec >= 3) {
        lastPeakSec = p.tSec;
        events.push({
          id: `audiopeak-${i}`,
          type: "audio_peak",
          startMs: clamp(p.tSec * 1000),
          endMs: null,
          label: `Pic d'intensité audio (${p.momentaryLufs.toFixed(1)} LUFS)`,
          detail: `Mesure DSP EBU R128, ~${(p.momentaryLufs - median).toFixed(1)} LU au-dessus du niveau médian.`,
          source: "audio_dsp",
          score: null,
        });
      }
    });
  }

  input.sceneDetection?.changes.forEach((c, i) => {
    if (!c.isCut) return;
    events.push({
      id: `scene-${i}`,
      type: "scene_change",
      startMs: clamp(c.timestampMs),
      endMs: null,
      label: "Changement de plan",
      detail: `Différence image ${(c.changeScore * 100).toFixed(0)} % vs frame précédente (mesure, pas IA).`,
      source: "scene_detection",
      score: null,
    });
  });

  return events.sort((a, b) => a.startMs - b.startMs || a.type.localeCompare(b.type));
}

export function attachHighlightMarkers(
  base: TimelineEvent[],
  highlights: { startMs: number; endMs: number; score: number; reasons: string[] }[],
  weakMoments: { startMs: number; endMs: number; score: number; reasons: string[] }[]
): TimelineEvent[] {
  const extra: TimelineEvent[] = [];
  highlights.forEach((h, i) =>
    extra.push({
      id: `highlight-${i}`,
      type: "highlight",
      startMs: h.startMs,
      endMs: h.endMs,
      label: `Moment fort · score ${Math.round(h.score)}`,
      detail: h.reasons.join(" · ") || null,
      source: "highlight_scoring",
      score: h.score,
    })
  );
  weakMoments.forEach((w, i) =>
    extra.push({
      id: `weak-${i}`,
      type: "weak_moment",
      startMs: w.startMs,
      endMs: w.endMs,
      label: `Moment potentiellement faible · score ${Math.round(w.score)}`,
      detail: w.reasons.join(" · ") || null,
      source: "highlight_scoring",
      score: w.score,
    })
  );
  return [...base, ...extra].sort((a, b) => a.startMs - b.startMs);
}
