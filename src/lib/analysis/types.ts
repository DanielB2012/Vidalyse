// Priority 3 — "Analyse Vidalyse complète".
//
// Every field here is either (a) a real measurement (DSP, frame diff, YouTube
// API), (b) a deterministic score computed from those measurements, or (c) an
// AI interpretation that is ALWAYS tagged as such. Nothing is invented: when a
// signal is missing, the producing service returns `null` / `available:false`
// with an explicit reason rather than a plausible-looking number.

// ---------- Scene detection (real frame-to-frame difference, no AI) ----------

export interface SceneChange {
  timestampMs: number;
  /** 0..1 mean absolute luma difference vs the previous extracted frame. */
  changeScore: number;
  /** true when changeScore crosses the video's own adaptive threshold. */
  isCut: boolean;
}

export interface SceneDetectionResult {
  method: "frame-diff";
  frameCount: number;
  changes: SceneChange[];
  meanChange: number;
  /** Honest caveat, e.g. very few frames were available. */
  note: string | null;
}

// ---------- Unified timeline ----------

export type TimelineEventType =
  | "scene_change"
  | "vision_event"
  | "speech"
  | "silence"
  | "audio_peak"
  | "highlight"
  | "weak_moment";

export type TimelineSource =
  | "scene_detection"
  | "vision_model"
  | "transcript"
  | "audio_dsp"
  | "highlight_scoring";

export interface TimelineEvent {
  id: string;
  type: TimelineEventType;
  startMs: number;
  endMs: number | null;
  label: string;
  detail: string | null;
  source: TimelineSource;
  /** Only set for highlight / weak_moment. 0..100. */
  score: number | null;
}

// ---------- Highlight scoring ----------

export interface HighlightContribution {
  key: string;
  label: string;
  /** Normalised 0..1 contribution value before weighting. */
  value: number;
  /** Weight applied in the final sum (can be negative, e.g. silence). */
  weight: number;
}

export interface Highlight {
  startMs: number;
  endMs: number;
  /** 0..100 — an analytic ESTIMATE by Vidalyse, not an absolute truth. */
  score: number;
  reasons: string[];
  contributions: HighlightContribution[];
  /** Raw sources that fed the score: "vision" | "audio" | "speech" | "scene". */
  signals: string[];
}

export interface HighlightScoringResult {
  windowSec: number;
  highlights: Highlight[];
  weakMoments: Highlight[];
  /** null when at least one signal existed; a reason string otherwise. */
  note: string | null;
  disclaimer: string;
}

// ---------- Structure analysis ----------

export type StructureKind =
  | "intro"
  | "hook"
  | "developpement"
  | "changement_de_sujet"
  | "passage_important"
  | "conclusion"
  | "appel_a_action"
  | "outro";

export type Confidence = "faible" | "moyenne" | "elevee";

export interface StructureSegment {
  kind: StructureKind;
  startMs: number;
  endMs: number;
  label: string;
  confidence: Confidence;
  /** What the label is based on (heuristic rules + optional AI). */
  basis: string[];
}

export interface VideoStructure {
  segments: StructureSegment[];
  /** true when there was not enough data to say anything beyond time-based guesses. */
  undetermined: boolean;
  note: string | null;
  /** Set when an AI pass refined the heuristic labels. */
  aiRefined: boolean;
}

// ---------- Hook analysis ----------

export interface HookAnalysis {
  available: boolean;
  reason: string | null;
  windowMs: number;
  // Deterministic measurements:
  firstWords: string | null;
  wordsPerSecond: number | null;
  sceneCutCount: number;
  visionEventCount: number;
  loudnessVsRestDb: number | null;
  // AI interpretation (hypotheses, never certainties):
  promise: string | null;
  promiseDeliveredAtMs: number | null;
  consistency: "coherent" | "partiel" | "incoherent" | "indetermine";
  observations: string[];
  recommendations: string[];
  aiUsed: boolean;
}

// ---------- Cross analysis (AI, structured) ----------

export type InsightBasis = "fait" | "donnee" | "interpretation" | "hypothese";

export interface TaggedPoint {
  text: string;
  atMs: number | null;
  basis: InsightBasis;
}

export interface KeyMoment {
  atMs: number;
  text: string;
  why: string;
}

export interface Recommendation {
  text: string;
  atMs: number | null;
  rationale: string;
}

export interface CrossInsight {
  text: string;
  sources: string[];
  kind: "correlation" | "contradiction";
}

export interface CrossAnalysis {
  summary: string;
  strengths: TaggedPoint[];
  weaknesses: TaggedPoint[];
  keyMoments: KeyMoment[];
  structureNotes: string | null;
  recommendations: Recommendation[];
  hypotheses: string[];
  crossInsights: CrossInsight[];
}

// ---------- Shorts extraction ----------

export interface ShortProposal {
  id: string;
  startMs: number;
  endMs: number;
  targetDurationSec: number;
  score: number;
  reason: string;
  signals: string[];
  transcriptPreview: string | null;
}

export type ShortsResult =
  | {
      ok: true;
      mode: "count" | "auto";
      requested: number | null;
      targetDurationSec: number;
      proposals: ShortProposal[];
    }
  | {
      ok: false;
      mode: "count" | "auto";
      requested: number | null;
      targetDurationSec: number;
      reason: string;
      produced: number;
      proposals: ShortProposal[];
    };

// ---------- Pre-publish estimation ----------

export type Band = "signal positif" | "neutre" | "signal faible" | "insuffisant";

export interface PrePublishEstimate {
  available: boolean;
  reason: string | null;
  hookStrength: Band;
  titleFit: Band;
  formatPotential: Band;
  pacing: Band;
  viewsPotential: { band: Band; note: string };
  likesPotential: { band: Band; note: string };
  uncertainty: "faible" | "moyenne" | "elevee";
  signals: string[];
  caveats: string[];
}

// ---------- Channel comparison ----------

export interface ChannelPerformanceDetail {
  views: number | null;
  likes: number | null;
  comments: number | null;
  estimatedMinutesWatched: number | null;
  averageViewDurationSec: number | null;
  averageViewPercentage: number | null;
  subscribersGained: number | null;
}

export interface ChannelComparisonMatch {
  videoId: string;
  title: string;
  similarity: number;
  sharedTraits: string[];
  performance: { views: number | null; avgViewPercentage: number | null } | null;
  /** Full real YouTube metrics, filled only by the on-demand comparison route
   *  (§6) when the video is linked to YouTube. null = linked but no data;
   *  undefined = not fetched. */
  performanceDetail?: ChannelPerformanceDetail | null;
}

export interface ChannelComparison {
  available: boolean;
  reason: string | null;
  basisCount: number;
  matches: ChannelComparisonMatch[];
  note: string | null;
  /** How hook similarity was computed. "lexical" = Jaccard on words (fast,
   *  always available); "semantique" = local MiniLM embeddings (finer, only
   *  when the model is installed). Surfaced in the UI (§7). */
  method: "lexical" | "semantique";
}

// ---------- Bundle persisted inside MergedAnalysis ----------

export interface EnrichedAnalysis {
  sceneDetection: SceneDetectionResult | null;
  timeline: TimelineEvent[] | null;
  highlights: HighlightScoringResult | null;
  structure: VideoStructure | null;
  hook: HookAnalysis | null;
  cross: CrossAnalysis | null;
  comparison: ChannelComparison | null;
}

export const HIGHLIGHT_DISCLAIMER =
  "Le score des moments forts est une estimation analytique de Vidalyse calculée à partir des signaux réellement mesurés (image, audio, parole, structure). Ce n'est pas une vérité absolue.";
