import type { TranscriptSegment } from "@/lib/pipeline/types";
import { scoreHighlights, type HighlightScoringInput } from "./highlightScoring";
import type { Highlight, ShortProposal, ShortsResult } from "./types";

export interface ShortsRequest {
  durationMs: number;
  targetDurationSec: number;
  /** exact count the user asked for; null = "laisser Vidalyse choisir". */
  count: number | null;
  transcript: TranscriptSegment[] | null;
  scoring: HighlightScoringInput;
}

const MIN_VIABLE_SCORE = 22;
const AUTO_MAX = 10;

function transcriptPreview(transcript: TranscriptSegment[] | null, startMs: number, endMs: number): string | null {
  if (!transcript?.length) return null;
  const txt = transcript
    .filter((s) => s.endTimestampMs > startMs && s.timestampMs < endMs)
    .map((s) => s.text.trim())
    .join(" ")
    .trim();
  return txt ? (txt.length > 160 ? `${txt.slice(0, 157)}…` : txt) : null;
}

function isViable(h: Highlight, hasPreview: boolean): boolean {
  if (h.score < MIN_VIABLE_SCORE) return false;
  // A usable Short needs *something* to carry it: speech, a vision beat, or a
  // clear audio+visual combo. A window that only scored on "not silent" is not.
  return hasPreview || h.signals.includes("vision") || (h.signals.includes("audio") && h.signals.includes("scene"));
}

function toProposal(
  h: Highlight,
  targetDurationSec: number,
  durationMs: number,
  transcript: TranscriptSegment[] | null
): ShortProposal {
  const targetMs = targetDurationSec * 1000;
  const center = (h.startMs + h.endMs) / 2;
  let startMs = Math.round(Math.max(0, center - targetMs / 2));
  const endMs = Math.round(Math.min(durationMs, startMs + targetMs));
  startMs = Math.max(0, endMs - targetMs);
  const preview = transcriptPreview(transcript, startMs, endMs);
  return {
    id: `short-${startMs}`,
    startMs,
    endMs,
    targetDurationSec,
    score: h.score,
    reason: h.reasons.join(" · ") || "Combinaison de signaux image / audio / parole",
    signals: h.signals,
    transcriptPreview: preview,
  };
}

// First real version of Shorts selection (§12). The requested count is never
// silently changed: if N truly usable moments can't be found, we return
// ok:false with the exact reason and however many we did find.
export function proposeShorts(req: ShortsRequest): ShortsResult {
  const targetDurationSec = Math.max(5, Math.min(90, Math.round(req.targetDurationSec) || 30));
  const mode: "count" | "auto" = req.count == null ? "auto" : "count";

  const scored = scoreHighlights({
    ...req.scoring,
    windowSec: targetDurationSec,
  });

  if (scored.note) {
    return {
      ok: false,
      mode,
      requested: req.count,
      targetDurationSec,
      reason: scored.note,
      produced: 0,
      proposals: [],
    };
  }

  const ranked = [...scored.highlights].sort((a, b) => b.score - a.score);
  const viable = ranked.filter((h) => isViable(h, Boolean(transcriptPreview(req.transcript, h.startMs, h.endMs))));

  const proposals = viable.map((h) => toProposal(h, targetDurationSec, req.durationMs, req.transcript));

  if (mode === "auto") {
    return {
      ok: true,
      mode,
      requested: null,
      targetDurationSec,
      proposals: proposals.slice(0, AUTO_MAX),
    };
  }

  const want = Math.max(1, Math.min(20, req.count!));
  if (proposals.length >= want) {
    return {
      ok: true,
      mode,
      requested: want,
      targetDurationSec,
      proposals: proposals.slice(0, want),
    };
  }

  const reasons: string[] = [];
  if (ranked.length === 0) reasons.push("aucun moment n'a atteint un score exploitable");
  else {
    reasons.push(
      `${proposals.length} moment(s) réellement exploitable(s) sur ${ranked.length} candidat(s) scorés`
    );
    if (!req.transcript?.length) reasons.push("pas de transcription pour porter les extraits");
    reasons.push(`seuil minimum de score : ${MIN_VIABLE_SCORE}/100`);
  }

  return {
    ok: false,
    mode,
    requested: want,
    targetDurationSec,
    reason: `Impossible de proposer ${want} Shorts exploitables : ${reasons.join(" ; ")}. Vidalyse ne remplace pas le nombre demandé par un autre — voici les ${proposals.length} moment(s) qui tiennent la route.`,
    produced: proposals.length,
    proposals,
  };
}
