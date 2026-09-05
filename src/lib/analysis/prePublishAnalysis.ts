import type { TranscriptSegment } from "@/lib/pipeline/types";
import type {
  Band,
  ChannelComparison,
  HighlightScoringResult,
  HookAnalysis,
  PrePublishEstimate,
  VideoStructure,
} from "./types";

export interface PrePublishInput {
  durationSec: number;
  title: string | null;
  transcript: TranscriptSegment[] | null;
  hook: HookAnalysis | null;
  structure: VideoStructure | null;
  highlights: HighlightScoringResult | null;
  comparison: ChannelComparison | null;
}

const INSUFF: Band = "insuffisant";

function talkDensity(transcript: TranscriptSegment[] | null, durationSec: number): number | null {
  if (!transcript?.length || durationSec <= 0) return null;
  const words = transcript.reduce((s, t) => s + (t.text.trim() ? t.text.trim().split(/\s+/).length : 0), 0);
  return words / durationSec; // words per second across the whole video
}

function titleFitBand(title: string | null, transcript: TranscriptSegment[] | null): { band: Band; note: string } {
  if (!title || !title.trim()) return { band: INSUFF, note: "Aucun titre fourni." };
  const len = title.trim().length;
  if (!transcript?.length) {
    return {
      band: "neutre",
      note: `Titre de ${len} caractères. Sans transcription, l'adéquation titre/contenu ne peut pas être évaluée.`,
    };
  }
  const titleWords = new Set(
    title
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 3)
  );
  const bodyText = transcript
    .map((t) => t.text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""))
    .join(" ");
  let hit = 0;
  titleWords.forEach((w) => bodyText.includes(w) && hit++);
  const ratio = titleWords.size ? hit / titleWords.size : 0;
  if (ratio >= 0.5 && len >= 20 && len <= 90) return { band: "signal positif", note: `${Math.round(ratio * 100)} % des mots-clés du titre apparaissent dans la vidéo.` };
  if (ratio >= 0.25) return { band: "neutre", note: `${Math.round(ratio * 100)} % des mots-clés du titre se retrouvent dans le contenu.` };
  return { band: "signal faible", note: `Peu de recoupement (${Math.round(ratio * 100)} %) entre le titre et ce qui est dit.` };
}

// Base for the future prediction engine (§13). Everything is qualitative and
// explicitly uncertain — no number is presented as a forecast.
export function estimatePrePublish(input: PrePublishInput): PrePublishEstimate {
  const signals: string[] = [];
  const caveats: string[] = [
    "Ce sont des estimations analytiques, pas des prédictions. Vidalyse ne peut pas garantir une performance.",
  ];

  const hasHook = input.hook?.available ?? false;
  const hasTranscript = (input.transcript?.length ?? 0) > 0;
  const hasHighlights = (input.highlights?.highlights.length ?? 0) > 0;

  if (!hasHook && !hasTranscript && !hasHighlights) {
    return {
      available: false,
      reason: "Pas assez de matière analysée (ni hook, ni parole, ni moments forts) pour une estimation.",
      hookStrength: INSUFF,
      titleFit: INSUFF,
      formatPotential: INSUFF,
      pacing: INSUFF,
      viewsPotential: { band: INSUFF, note: "Données insuffisantes." },
      likesPotential: { band: INSUFF, note: "Données insuffisantes." },
      uncertainty: "elevee",
      signals,
      caveats,
    };
  }

  // Hook strength.
  let hookStrength: Band = INSUFF;
  if (input.hook?.available) {
    const wps = input.hook.wordsPerSecond ?? 0;
    const cuts = input.hook.sceneCutCount;
    const consistent = input.hook.consistency === "coherent";
    if ((wps >= 1.8 || cuts >= 2 || input.hook.visionEventCount >= 2) && input.hook.promise) {
      hookStrength = consistent ? "signal positif" : "neutre";
      signals.push(consistent ? "Hook rythmé avec une promesse claire et tenue" : "Hook rythmé avec une promesse, cohérence à confirmer");
    } else if (wps < 0.8 && cuts === 0) {
      hookStrength = "signal faible";
      signals.push("Hook lent : peu de parole, aucune coupe dans les 15 premières secondes");
    } else {
      hookStrength = "neutre";
    }
  }

  // Pacing across the whole video.
  let pacing: Band = "neutre";
  const density = talkDensity(input.transcript, input.durationSec);
  const hlCount = input.highlights?.highlights.length ?? 0;
  const hlPerMin = input.durationSec ? hlCount / (input.durationSec / 60) : 0;
  if (density != null) {
    if (density >= 2.2 || hlPerMin >= 0.6) {
      pacing = "signal positif";
      signals.push(`Rythme soutenu (${density.toFixed(1)} mots/s, ${hlPerMin.toFixed(2)} moments forts/min)`);
    } else if (density < 1 && hlPerMin < 0.15) {
      pacing = "signal faible";
      signals.push("Rythme lent : faible densité de parole et peu de moments forts");
    }
  } else {
    pacing = INSUFF;
  }

  // Format potential — from duration + structure completeness.
  let formatPotential: Band = "neutre";
  const kinds = new Set((input.structure?.segments ?? []).map((s) => s.kind));
  const structured = kinds.has("hook") && kinds.has("developpement") && (kinds.has("conclusion") || kinds.has("outro"));
  if (structured && input.durationSec >= 60) {
    formatPotential = "signal positif";
    signals.push("Structure complète repérée (hook / développement / clôture)");
  } else if (input.structure?.undetermined) {
    formatPotential = INSUFF;
  } else if (!structured) {
    formatPotential = "neutre";
  }

  const titleFit = titleFitBand(input.title, input.transcript);

  // Views / likes potential — qualitative roll-up, heavily hedged.
  const positives = [hookStrength, pacing, formatPotential, titleFit.band].filter((b) => b === "signal positif").length;
  const negatives = [hookStrength, pacing, formatPotential, titleFit.band].filter((b) => b === "signal faible").length;
  const rollup: Band = positives >= 2 && negatives === 0 ? "signal positif" : negatives >= 2 ? "signal faible" : "neutre";

  const hasHistory = input.comparison?.available ?? false;
  const uncertainty: PrePublishEstimate["uncertainty"] = hasHistory
    ? positives >= 2
      ? "moyenne"
      : "elevee"
    : "elevee";

  if (hasHistory) {
    signals.push(
      `Comparé à ${input.comparison!.basisCount} vidéo(s) analysée(s) de la chaîne — ${input.comparison!.matches.length} proche(s).`
    );
  } else {
    caveats.push("Aucun historique de chaîne exploitable : incertitude élevée, pas de point de comparaison propre.");
  }
  caveats.push("Aucune donnée de vignette / CTR / titre A-B n'est disponible avant publication.");

  return {
    available: true,
    reason: null,
    hookStrength,
    titleFit: titleFit.band,
    formatPotential,
    pacing,
    viewsPotential: {
      band: rollup,
      note:
        rollup === "signal positif"
          ? "Plusieurs signaux favorables (hook, rythme, structure). Potentiel au-dessus de la moyenne de la chaîne — estimation, incertitude réelle."
          : rollup === "signal faible"
            ? "Plusieurs signaux faibles. Potentiel de vues sans doute limité en l'état — à retravailler avant publication."
            : "Signaux mitigés : pas de tendance nette. Incertitude élevée.",
    },
    likesPotential: {
      band: rollup === "signal positif" ? "neutre" : rollup,
      note: "Le taux de likes dépend surtout de la satisfaction en fin de visionnage, non mesurable avant publication.",
    },
    uncertainty,
    signals,
    caveats,
  };
}
