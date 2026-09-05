import type { StructuredEvent } from "@/lib/ai/providers/types";
import type { AudioDspSummary, TranscriptSegment } from "@/lib/pipeline/types";
import {
  HIGHLIGHT_DISCLAIMER,
  type Highlight,
  type HighlightContribution,
  type HighlightScoringResult,
  type SceneDetectionResult,
} from "./types";

export interface HighlightScoringInput {
  durationMs: number;
  windowSec?: number;
  transcript: TranscriptSegment[] | null;
  visionEvents: StructuredEvent[] | null;
  audioDsp: AudioDspSummary | null;
  sceneDetection: SceneDetectionResult | null;
}

// Weights are deliberately explicit and surfaced in each Highlight's
// `contributions` so the score is auditable — nothing is a black box.
const WEIGHTS = {
  visualChange: 0.22,
  audioIntensity: 0.24,
  speechDensity: 0.18,
  speechEmphasis: 0.12,
  visionEventDensity: 0.16,
  sceneCut: 0.08,
  silence: -0.28,
} as const;

const EMPHASIS_RE = /[!?]|\b[A-ZÀ-ÖØ-Þ]{3,}\b/;

function overlapMs(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

export function scoreHighlights(input: HighlightScoringInput): HighlightScoringResult {
  const durationMs = input.durationMs;
  const windowSec = input.windowSec ?? Math.max(6, Math.min(15, Math.round(durationMs / 1000 / 20) || 8));
  const windowMs = windowSec * 1000;

  const hasAnySignal =
    (input.transcript?.length ?? 0) > 0 ||
    (input.visionEvents?.length ?? 0) > 0 ||
    (input.audioDsp?.loudnessSeries?.length ?? 0) > 0 ||
    (input.audioDsp?.silences?.length ?? 0) > 0 ||
    (input.sceneDetection?.changes?.length ?? 0) > 0;

  if (!hasAnySignal || durationMs < 2000) {
    return {
      windowSec,
      highlights: [],
      weakMoments: [],
      note:
        "Aucun signal exploitable (ni parole, ni analyse visuelle, ni mesure audio) — impossible de scorer des moments forts.",
      disclaimer: HIGHLIGHT_DISCLAIMER,
    };
  }

  // Loudness normalisation against the video's own distribution.
  const loud = input.audioDsp?.loudnessSeries ?? [];
  const loudVals = loud.map((p) => p.momentaryLufs).sort((a, b) => a - b);
  const loudMedian = loudVals.length ? loudVals[Math.floor(loudVals.length / 2)] : null;
  const loudMax = loudVals.length ? loudVals[loudVals.length - 1] : null;

  const step = Math.max(1000, Math.round(windowMs / 2));
  const windows: { startMs: number; endMs: number; score: number; contributions: HighlightContribution[]; signals: Set<string>; reasons: string[] }[] = [];

  for (let start = 0; start < Math.max(1, durationMs - windowMs / 2); start += step) {
    const end = Math.min(durationMs, start + windowMs);

    // --- visual change (scene detection frame diff) ---
    let visualChange = 0;
    const sceneInWin = (input.sceneDetection?.changes ?? []).filter(
      (c) => c.timestampMs >= start && c.timestampMs < end
    );
    if (sceneInWin.length) {
      visualChange = Math.min(1, Math.max(...sceneInWin.map((c) => c.changeScore)) / 0.4);
    }
    const sceneCut = sceneInWin.some((c) => c.isCut) ? 1 : 0;

    // --- audio intensity (relative to this video's median, capped) ---
    let audioIntensity = 0;
    if (loudMedian != null && loudMax != null && loudMax > loudMedian) {
      const winLoud = loud.filter((p) => p.tSec * 1000 >= start && p.tSec * 1000 < end);
      if (winLoud.length) {
        const winMax = Math.max(...winLoud.map((p) => p.momentaryLufs));
        audioIntensity = Math.min(1, Math.max(0, (winMax - loudMedian) / (loudMax - loudMedian)));
      }
    }

    // --- speech density & emphasis ---
    let speechMs = 0;
    let emphasis = 0;
    (input.transcript ?? []).forEach((seg) => {
      const ov = overlapMs(start, end, seg.timestampMs, seg.endTimestampMs || seg.timestampMs + 1);
      if (ov > 0) {
        speechMs += ov;
        if (EMPHASIS_RE.test(seg.text)) emphasis = 1;
      }
    });
    const speechDensity = Math.min(1, speechMs / (end - start));

    // --- vision event density ---
    const visionInWin = (input.visionEvents ?? []).filter(
      (e) => e.timestampMs >= start && e.timestampMs < end
    );
    const visionEventDensity = Math.min(1, visionInWin.length / 3);

    // --- silence penalty ---
    let silenceMs = 0;
    (input.audioDsp?.silences ?? []).forEach((s) => {
      const sEnd = s.endSec != null ? s.endSec * 1000 : durationMs;
      silenceMs += overlapMs(start, end, s.startSec * 1000, sEnd);
    });
    const silenceFrac = Math.min(1, silenceMs / (end - start));

    const contributions: HighlightContribution[] = [
      { key: "visualChange", label: "Changement visuel", value: round(visualChange), weight: WEIGHTS.visualChange },
      { key: "audioIntensity", label: "Intensité audio", value: round(audioIntensity), weight: WEIGHTS.audioIntensity },
      { key: "speechDensity", label: "Densité de parole", value: round(speechDensity), weight: WEIGHTS.speechDensity },
      { key: "speechEmphasis", label: "Emphase (parole)", value: emphasis, weight: WEIGHTS.speechEmphasis },
      { key: "visionEventDensity", label: "Événements Vision", value: round(visionEventDensity), weight: WEIGHTS.visionEventDensity },
      { key: "sceneCut", label: "Coupe de plan", value: sceneCut, weight: WEIGHTS.sceneCut },
      { key: "silence", label: "Silence", value: round(silenceFrac), weight: WEIGHTS.silence },
    ];

    const rawScore = contributions.reduce((s, c) => s + c.value * c.weight, 0);
    const score = Math.max(0, Math.min(1, rawScore)) * 100;

    const signals = new Set<string>();
    if (visualChange > 0.05 || sceneCut) signals.add("scene");
    if (audioIntensity > 0.05) signals.add("audio");
    if (speechDensity > 0.05) signals.add("speech");
    if (visionInWin.length) signals.add("vision");

    const reasons: string[] = [];
    if (sceneCut) reasons.push("coupe de plan détectée");
    if (audioIntensity > 0.5) reasons.push("intensité audio nettement au-dessus de la moyenne");
    if (speechDensity > 0.7) reasons.push("passage très parlé");
    if (visionInWin.length >= 2) reasons.push(`${visionInWin.length} événements visuels`);
    if (emphasis) reasons.push("emphase dans la parole (ponctuation / majuscules)");

    windows.push({ startMs: Math.round(start), endMs: Math.round(end), score, contributions, signals, reasons });
  }

  const byScoreDesc = [...windows].sort((a, b) => b.score - a.score);
  const highlights = pickNonOverlapping(byScoreDesc.filter((w) => w.score >= 25), 8).map(toHighlight);

  const weakCandidates = windows.filter((w) => {
    const silence = w.contributions.find((c) => c.key === "silence")!.value;
    const speech = w.contributions.find((c) => c.key === "speechDensity")!.value;
    const visual = w.contributions.find((c) => c.key === "visualChange")!.value;
    return w.score <= 12 && (silence > 0.4 || (speech < 0.15 && visual < 0.1));
  });
  const weakMoments = pickNonOverlapping(
    [...weakCandidates].sort((a, b) => a.score - b.score),
    5
  ).map((w) => {
    const reasons: string[] = [];
    const silence = w.contributions.find((c) => c.key === "silence")!.value;
    const speech = w.contributions.find((c) => c.key === "speechDensity")!.value;
    const visual = w.contributions.find((c) => c.key === "visualChange")!.value;
    if (silence > 0.4) reasons.push("silence important");
    if (speech < 0.15) reasons.push("très peu de parole");
    if (visual < 0.1) reasons.push("image quasi statique");
    return { ...toHighlight(w), reasons };
  });

  return { windowSec, highlights, weakMoments, note: null, disclaimer: HIGHLIGHT_DISCLAIMER };
}

function round(n: number): number {
  return Number(n.toFixed(3));
}

function toHighlight(w: {
  startMs: number;
  endMs: number;
  score: number;
  contributions: HighlightContribution[];
  signals: Set<string>;
  reasons: string[];
}): Highlight {
  return {
    startMs: w.startMs,
    endMs: w.endMs,
    score: Number(w.score.toFixed(1)),
    reasons: w.reasons,
    contributions: w.contributions,
    signals: [...w.signals],
  };
}

function pickNonOverlapping<T extends { startMs: number; endMs: number }>(sorted: T[], max: number): T[] {
  const picked: T[] = [];
  for (const w of sorted) {
    if (picked.length >= max) break;
    if (picked.some((p) => overlapMs(p.startMs, p.endMs, w.startMs, w.endMs) > (w.endMs - w.startMs) * 0.3)) {
      continue;
    }
    picked.push(w);
  }
  return picked.sort((a, b) => a.startMs - b.startMs);
}
