import type { StructuredEvent } from "@/lib/ai/providers/types";
import type { AudioDspSummary, TranscriptSegment } from "@/lib/pipeline/types";
import { parseModelJson } from "./json";
import type {
  ChannelComparison,
  CrossAnalysis,
  CrossInsight,
  HighlightScoringResult,
  HookAnalysis,
  InsightBasis,
  KeyMoment,
  Recommendation,
  SceneDetectionResult,
  TaggedPoint,
  VideoStructure,
} from "./types";

export interface CrossAnalysisInput {
  video: { durationSec: number; width: number | null; height: number | null; fps: number | null };
  title: string | null;
  audioDsp: AudioDspSummary | null;
  transcript: TranscriptSegment[] | null;
  visionEvents: StructuredEvent[] | null;
  sceneDetection: SceneDetectionResult | null;
  highlights: HighlightScoringResult | null;
  structure: VideoStructure | null;
  hook: HookAnalysis | null;
  youtubeStats: Record<string, number | string | null> | null;
  youtubeMissing: string[];
  comparison: ChannelComparison | null;
}

const SYSTEM = `Tu es le module de synthèse croisée de Vidalyse. Tu reçois les résultats RÉELS de plusieurs analyses
séparées d'UNE vidéo : mesures techniques, DSP audio, transcription horodatée, événements détectés par un
modèle Vision, détection de plans, moments forts scorés par Vidalyse, structure, hook, et données YouTube
quand elles existent.

Ton rôle : CROISER ces sources. Cherche des corrélations et des contradictions entre elles. Exemples de ce
que tu dois repérer : un changement visuel qui tombe sur une phrase importante ; un silence juste avant ou
après un événement ; une accélération du rythme ; un hook qui promet quelque chose qui n'arrive que bien
plus tard ; un écart entre ce que montre la vidéo et ce que suggèrent les statistiques.

Règles ABSOLUES :
- Ne JAMAIS inventer une donnée, un timestamp ou une statistique qui n'est pas fournie.
- Toujours étiqueter chaque affirmation : "fait" (observé dans les données), "donnee" (chiffre fourni),
  "interpretation" (ta lecture prudente), "hypothese" (piste à vérifier).
- Une corrélation n'est jamais une causalité.
- Si une source manque, dis-le, ne comble pas le vide.
- Les timestamps que tu cites doivent venir des données fournies.

Réponds UNIQUEMENT avec ce JSON, sans texte autour :
{
 "summary": string,
 "strengths": [{"text": string, "atMs": number|null, "basis": "fait|donnee|interpretation|hypothese"}],
 "weaknesses": [{"text": string, "atMs": number|null, "basis": "fait|donnee|interpretation|hypothese"}],
 "keyMoments": [{"atMs": number, "text": string, "why": string}],
 "structureNotes": string|null,
 "recommendations": [{"text": string, "atMs": number|null, "rationale": string}],
 "hypotheses": [string],
 "crossInsights": [{"text": string, "sources": [string], "kind": "correlation|contradiction"}]
}
Les recommandations doivent être concrètes et, quand c'est possible, rattachées à un timestamp réel
(ex : "Entre 01:42 et 02:08, le rythme visuel ralentit alors que la narration continue — tester une coupe").
Évite les conseils génériques ("améliore ton montage").`;

function ts(ms: number): string {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function buildCrossAnalysisPrompt(input: CrossAnalysisInput): { system: string; user: string } {
  const parts: string[] = [];
  const durMs = input.video.durationSec * 1000;

  parts.push(
    `MÉTADONNÉES\n- Titre : ${input.title ?? "(inconnu)"}\n- Durée : ${input.video.durationSec.toFixed(1)} s` +
      `\n- Résolution : ${input.video.width ?? "?"}x${input.video.height ?? "?"} @ ${input.video.fps?.toFixed(1) ?? "?"} fps`
  );

  if (input.audioDsp) {
    const totalSilence = input.audioDsp.silences.reduce((s, x) => {
      const end = x.endSec ?? input.video.durationSec;
      return s + Math.max(0, end - x.startSec);
    }, 0);
    parts.push(
      `AUDIO (DSP réel, pas d'IA)\n- Volume moyen : ${input.audioDsp.meanVolumeDb ?? "n/a"} dB\n- Volume max : ${input.audioDsp.maxVolumeDb ?? "n/a"} dB` +
        `\n- Silences : ${input.audioDsp.silences.length} (${totalSilence.toFixed(1)} s cumulées)` +
        (input.audioDsp.silences.length
          ? `\n  ${input.audioDsp.silences.map((s) => `${s.startSec.toFixed(1)}s→${s.endSec?.toFixed(1) ?? "?"}s`).join(", ")}`
          : "") +
        ((input.audioDsp.loudnessSeries?.length ?? 0) > 0
          ? `\n- Courbe de loudness EBU R128 : ${input.audioDsp.loudnessSeries!.length} points (1/s)`
          : "")
    );
  } else {
    parts.push("AUDIO : indisponible.");
  }

  if (input.transcript?.length) {
    const body = input.transcript.map((t) => `[${ts(t.timestampMs)}] ${t.text.trim()}`).join("\n").slice(0, 9000);
    parts.push(`TRANSCRIPTION (horodatée)\n${body}`);
  } else {
    parts.push("TRANSCRIPTION : indisponible.");
  }

  if (input.visionEvents?.length) {
    parts.push(
      `ÉVÉNEMENTS VISION (ce que le modèle a réellement observé)\n` +
        input.visionEvents.map((e) => `[${ts(e.timestampMs)}] (${e.type}) ${e.description}`).join("\n").slice(0, 4000)
    );
  } else {
    parts.push("ÉVÉNEMENTS VISION : indisponible.");
  }

  if (input.sceneDetection?.changes.length) {
    const cuts = input.sceneDetection.changes.filter((c) => c.isCut);
    parts.push(
      `DÉTECTION DE PLANS (différence d'image mesurée)\n- ${cuts.length} coupes : ${cuts.map((c) => ts(c.timestampMs)).join(", ") || "aucune"}` +
        (input.sceneDetection.note ? `\n- Note : ${input.sceneDetection.note}` : "")
    );
  }

  if (input.highlights?.highlights.length) {
    parts.push(
      `MOMENTS FORTS (scorés par Vidalyse, estimation analytique)\n` +
        input.highlights.highlights
          .map(
            (h) =>
              `- ${ts(h.startMs)}–${ts(h.endMs)} score ${Math.round(h.score)} | ${h.reasons.join(", ") || "signaux combinés"} | signaux: ${h.signals.join(",")}`
          )
          .join("\n")
    );
    if (input.highlights.weakMoments.length) {
      parts.push(
        `MOMENTS POTENTIELLEMENT FAIBLES\n` +
          input.highlights.weakMoments.map((w) => `- ${ts(w.startMs)}–${ts(w.endMs)} | ${w.reasons.join(", ")}`).join("\n")
      );
    }
  }

  if (input.structure && !input.structure.undetermined) {
    parts.push(
      `STRUCTURE (heuristique${input.structure.aiRefined ? " + affinage IA" : ""})\n` +
        input.structure.segments.map((s) => `- ${s.label} ${ts(s.startMs)}–${ts(s.endMs)} (confiance ${s.confidence})`).join("\n")
    );
  } else if (input.structure?.undetermined) {
    parts.push(`STRUCTURE : indéterminée (${input.structure.note ?? "données insuffisantes"}).`);
  }

  if (input.hook?.available) {
    parts.push(
      `HOOK (0–${Math.round(input.hook.windowMs / 1000)} s)\n- Premiers mots : "${input.hook.firstWords ?? "n/a"}"` +
        `\n- Débit : ${input.hook.wordsPerSecond ?? "n/a"} mots/s | coupes : ${input.hook.sceneCutCount} | événements visuels : ${input.hook.visionEventCount}` +
        (input.hook.loudnessVsRestDb != null ? `\n- Volume hook vs reste : ${input.hook.loudnessVsRestDb} LU` : "") +
        (input.hook.promise ? `\n- Promesse identifiée : ${input.hook.promise} (cohérence : ${input.hook.consistency})` : "")
    );
  }

  if (input.youtubeStats && Object.keys(input.youtubeStats).length) {
    parts.push(
      `DONNÉES YOUTUBE (réelles, API)\n` +
        Object.entries(input.youtubeStats)
          .map(([k, v]) => `- ${k} : ${v ?? "donnée indisponible"}`)
          .join("\n")
    );
  } else {
    parts.push("DONNÉES YOUTUBE : vidéo non liée à YouTube.");
  }
  if (input.youtubeMissing.length) {
    parts.push(
      `NON DISPONIBLE VIA L'API YOUTUBE (ne pas prétendre les connaître) : ${input.youtubeMissing.join(", ")}.`
    );
  }

  if (input.comparison?.available && input.comparison.matches.length) {
    parts.push(
      `COMPARAISON AVEC LES ANCIENNES VIDÉOS DE CETTE CHAÎNE (${input.comparison.basisCount} analysées)\n` +
        input.comparison.matches
          .map(
            (m) =>
              `- "${m.title}" similarité ${(m.similarity * 100).toFixed(0)}% (${m.sharedTraits.join(", ")})` +
              (m.performance
                ? ` — vues ${m.performance.views ?? "n/a"}, % vu ${m.performance.avgViewPercentage ?? "n/a"}`
                : "")
          )
          .join("\n")
    );
  }

  parts.push(
    `Durée en ms pour situer les timestamps : ${Math.round(durMs)}. Renvoie maintenant le JSON de synthèse croisée.`
  );

  return { system: SYSTEM, user: parts.join("\n\n") };
}

const BASES = new Set<InsightBasis>(["fait", "donnee", "interpretation", "hypothese"]);

function taggedPoints(arr: unknown, durMs: number): TaggedPoint[] {
  if (!Array.isArray(arr)) return [];
  return (arr as Record<string, unknown>[])
    .map((p) => {
      const text = typeof p.text === "string" ? p.text.trim() : "";
      if (!text) return null;
      const basis = p.basis as InsightBasis;
      const atMs =
        typeof p.atMs === "number" && Number.isFinite(p.atMs)
          ? Math.max(0, Math.min(durMs, Math.round(p.atMs)))
          : null;
      return { text, atMs, basis: BASES.has(basis) ? basis : "interpretation" } satisfies TaggedPoint;
    })
    .filter((x): x is TaggedPoint => x !== null)
    .slice(0, 12);
}

export function parseCrossAnalysis(raw: string, durationSec: number): CrossAnalysis | null {
  const parsed = parseModelJson(raw);
  if (!parsed.ok || !parsed.value) return null;
  const durMs = durationSec * 1000;
  try {
    const p = parsed.value as Record<string, unknown>;
    if (typeof p.summary !== "string" || !p.summary.trim()) return null;

    const keyMoments: KeyMoment[] = Array.isArray(p.keyMoments)
      ? (p.keyMoments as Record<string, unknown>[])
          .map((k) => {
            const atMs = Number(k.atMs);
            if (!Number.isFinite(atMs)) return null;
            const text = typeof k.text === "string" ? k.text.trim() : "";
            if (!text) return null;
            return {
              atMs: Math.max(0, Math.min(durMs, Math.round(atMs))),
              text,
              why: typeof k.why === "string" ? k.why.trim() : "",
            } satisfies KeyMoment;
          })
          .filter((x): x is KeyMoment => x !== null)
          .slice(0, 12)
      : [];

    const recommendations: Recommendation[] = Array.isArray(p.recommendations)
      ? (p.recommendations as Record<string, unknown>[])
          .map((r) => {
            const text = typeof r.text === "string" ? r.text.trim() : "";
            if (!text) return null;
            const atMs =
              typeof r.atMs === "number" && Number.isFinite(r.atMs)
                ? Math.max(0, Math.min(durMs, Math.round(r.atMs)))
                : null;
            return {
              text,
              atMs,
              rationale: typeof r.rationale === "string" ? r.rationale.trim() : "",
            } satisfies Recommendation;
          })
          .filter((x): x is Recommendation => x !== null)
          .slice(0, 12)
      : [];

    const crossInsights: CrossInsight[] = Array.isArray(p.crossInsights)
      ? (p.crossInsights as Record<string, unknown>[])
          .map((c) => {
            const text = typeof c.text === "string" ? c.text.trim() : "";
            if (!text) return null;
            return {
              text,
              sources: Array.isArray(c.sources) ? (c.sources as unknown[]).map(String).slice(0, 6) : [],
              kind: c.kind === "contradiction" ? "contradiction" : "correlation",
            } satisfies CrossInsight;
          })
          .filter((x): x is CrossInsight => x !== null)
          .slice(0, 12)
      : [];

    return {
      summary: p.summary.trim(),
      strengths: taggedPoints(p.strengths, durMs),
      weaknesses: taggedPoints(p.weaknesses, durMs),
      keyMoments,
      structureNotes: typeof p.structureNotes === "string" && p.structureNotes.trim() ? p.structureNotes.trim() : null,
      recommendations,
      hypotheses: Array.isArray(p.hypotheses) ? (p.hypotheses as unknown[]).map(String).filter(Boolean).slice(0, 10) : [],
      crossInsights,
    };
  } catch {
    return null;
  }
}

// Keeps the existing `textSynthesis` UI field populated from the structured
// result, so nothing downstream that reads it breaks.
export function crossAnalysisToMarkdown(c: CrossAnalysis): string {
  const fmt = (ms: number | null) => (ms == null ? "" : ` _(${ts(ms)})_`);
  const lines: string[] = [];
  lines.push(c.summary, "");
  if (c.strengths.length) {
    lines.push("## Points forts");
    c.strengths.forEach((s) => lines.push(`- ${s.text}${fmt(s.atMs)} — _${s.basis}_`));
    lines.push("");
  }
  if (c.weaknesses.length) {
    lines.push("## Points faibles");
    c.weaknesses.forEach((s) => lines.push(`- ${s.text}${fmt(s.atMs)} — _${s.basis}_`));
    lines.push("");
  }
  if (c.crossInsights.length) {
    lines.push("## Croisements");
    c.crossInsights.forEach((s) => lines.push(`- **${s.kind === "contradiction" ? "Contradiction" : "Corrélation"}** (${s.sources.join(", ")}) : ${s.text}`));
    lines.push("");
  }
  if (c.recommendations.length) {
    lines.push("## Recommandations");
    c.recommendations.forEach((r) => lines.push(`- ${r.text}${fmt(r.atMs)}${r.rationale ? ` — ${r.rationale}` : ""}`));
    lines.push("");
  }
  if (c.hypotheses.length) {
    lines.push("## Hypothèses à vérifier");
    c.hypotheses.forEach((h) => lines.push(`- ${h}`));
  }
  return lines.join("\n").trim();
}
