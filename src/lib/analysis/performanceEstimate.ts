import type { ChannelComparison } from "./types";
import type { PrePublishEstimate } from "./types";

export interface MetricRange {
  low: number;
  high: number;
}

export interface PerformanceEstimate {
  available: boolean;
  reason: string | null;
  /** "historique_chaine" = numeric ranges from ≥4 similar own-channel videos;
   *  "qualitatif" = not enough history, only signals (no numbers). */
  method: "historique_chaine" | "qualitatif";
  contentType: "short" | "long" | "inconnu";
  confidence: "faible" | "moyenne";
  basisVideoIds: string[];
  basisCount: number;
  metrics: {
    views?: MetricRange;
    likes?: MetricRange;
    comments?: MetricRange;
    avgViewPercentage?: MetricRange;
  };
  factors: { positive: string[]; negative: string[]; uncertainties: string[] };
  dataUsed: string[];
}

const MIN_HISTORY = 4;

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  return sorted[base + 1] !== undefined
    ? sorted[base] + rest * (sorted[base + 1] - sorted[base])
    : sorted[base];
}

function coefVariation(values: number[]): number {
  if (values.length < 2) return 1;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  if (mean === 0) return 1;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance) / mean;
}

function rangeFor(values: number[], adjust: number): MetricRange | undefined {
  const clean = values.filter((v) => Number.isFinite(v) && v >= 0).sort((a, b) => a - b);
  if (clean.length < MIN_HISTORY) return undefined;
  const low = quantile(clean, 0.25) * (1 + adjust - 0.12);
  const high = quantile(clean, 0.75) * (1 + adjust + 0.12);
  return { low: Math.max(0, Math.round(low)), high: Math.max(Math.round(low), Math.round(high)) };
}

export interface PerformanceEstimateInput {
  durationSec: number;
  comparison: ChannelComparison | null;
  prePublish: PrePublishEstimate | null;
}

// Architecture for the performance-estimation feature (§11). A numeric range is
// ONLY produced when there are ≥4 similar own-channel videos with real metrics.
// Otherwise it stays qualitative — no fabricated numbers, ever.
export function estimatePerformance(input: PerformanceEstimateInput): PerformanceEstimate {
  const contentType: PerformanceEstimate["contentType"] =
    input.durationSec > 0 ? (input.durationSec <= 90 ? "short" : "long") : "inconnu";

  const positive: string[] = [];
  const negative: string[] = [];
  const uncertainties: string[] = [
    "Aucune donnée de vignette, de CTR ou de test A/B de titre n'existe avant publication.",
    "Une estimation reste une estimation : Vidalyse n'a pas de boule de cristal.",
  ];
  const dataUsed: string[] = [];

  if (input.prePublish?.available) {
    if (input.prePublish.hookStrength === "signal positif") positive.push("Hook jugé solide");
    if (input.prePublish.hookStrength === "signal faible") negative.push("Hook jugé faible");
    if (input.prePublish.pacing === "signal positif") positive.push("Rythme soutenu");
    if (input.prePublish.pacing === "signal faible") negative.push("Rythme lent");
    if (input.prePublish.titleFit === "signal positif") positive.push("Titre cohérent avec le contenu");
    if (input.prePublish.titleFit === "signal faible") negative.push("Titre peu cohérent avec le contenu");
    if (input.prePublish.formatPotential === "signal positif") positive.push("Structure complète");
    dataUsed.push("Analyse hook / rythme / structure / titre de la vidéo");
  }

  const similar = (input.comparison?.matches ?? []).filter((m) => m.performanceDetail);
  const basisVideoIds = similar.map((m) => m.videoId);

  if (similar.length < MIN_HISTORY) {
    return {
      available: false,
      reason:
        similar.length === 0
          ? "Aucune vidéo similaire de ta chaîne avec des statistiques exploitables. Vidalyse ne fabrique pas d'estimation chiffrée sans historique."
          : `Seulement ${similar.length} vidéo(s) similaire(s) avec des stats (minimum ${MIN_HISTORY}). Estimation chiffrée non affichée — pas assez d'historique.`,
      method: "qualitatif",
      contentType,
      confidence: "faible",
      basisVideoIds,
      basisCount: similar.length,
      metrics: {},
      factors: { positive, negative, uncertainties },
      dataUsed,
    };
  }

  // Signal adjustment: shift the historical band by a small, bounded amount.
  let adjust = 0;
  if (input.prePublish?.available) {
    const bump = (b: string | undefined) => (b === "signal positif" ? 0.08 : b === "signal faible" ? -0.08 : 0);
    adjust =
      bump(input.prePublish.hookStrength) +
      bump(input.prePublish.pacing) +
      bump(input.prePublish.formatPotential) / 2;
    adjust = Math.max(-0.25, Math.min(0.25, adjust));
  }

  const views = similar.map((m) => m.performanceDetail!.views ?? NaN);
  const likes = similar.map((m) => m.performanceDetail!.likes ?? NaN);
  const comments = similar.map((m) => m.performanceDetail!.comments ?? NaN);
  const avgPct = similar.map((m) => m.performanceDetail!.averageViewPercentage ?? NaN);

  const metrics: PerformanceEstimate["metrics"] = {
    views: rangeFor(views, adjust),
    likes: rangeFor(likes, adjust),
    comments: rangeFor(comments, adjust),
    avgViewPercentage: rangeFor(avgPct.filter((v) => Number.isFinite(v)), 0),
  };

  const cv = coefVariation(views.filter((v) => Number.isFinite(v)));
  const confidence: PerformanceEstimate["confidence"] =
    similar.length >= 8 && cv < 0.8 ? "moyenne" : "faible";

  dataUsed.push(`${similar.length} vidéo(s) similaire(s) de ta chaîne avec stats YouTube réelles`);
  dataUsed.push(`Comparaison ${input.comparison?.method === "semantique" ? "sémantique" : "lexicale"} du hook, durée, structure`);
  uncertainties.push(
    `Échantillon de ${similar.length} vidéo(s) — variabilité des vues ${(cv * 100).toFixed(0)} %.`
  );
  if (input.comparison?.method !== "semantique") {
    uncertainties.push("Similarité calculée lexicalement — installe le modèle d'embeddings pour affiner.");
  }

  return {
    available: true,
    reason: null,
    method: "historique_chaine",
    contentType,
    confidence,
    basisVideoIds,
    basisCount: similar.length,
    metrics,
    factors: { positive, negative, uncertainties },
    dataUsed,
  };
}

export function formatRange(r: MetricRange | undefined): string {
  if (!r) return "estimation indisponible";
  const fmt = (n: number) => new Intl.NumberFormat("fr-FR").format(Math.round(n));
  return `${fmt(r.low)} – ${fmt(r.high)}`;
}
