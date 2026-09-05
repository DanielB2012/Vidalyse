import type { StructuredEvent } from "@/lib/ai/providers/types";
import type { AudioDspSummary, TranscriptSegment } from "@/lib/pipeline/types";
import { parseModelJson } from "./json";
import type { HookAnalysis, SceneDetectionResult } from "./types";

export interface HookInput {
  durationMs: number;
  transcript: TranscriptSegment[] | null;
  visionEvents: StructuredEvent[] | null;
  audioDsp: AudioDspSummary | null;
  sceneDetection: SceneDetectionResult | null;
}

const HOOK_MS = 15000;

// Deterministic part of the hook analysis — pure measurements over the first
// ~15 s. The AI interpretation is layered on top by the pipeline and is always
// tagged as hypothesis.
export function measureHook(input: HookInput): HookAnalysis {
  const windowMs = Math.min(HOOK_MS, input.durationMs);
  const inWin = <T extends { timestampMs: number }>(arr: T[] | null) =>
    (arr ?? []).filter((x) => x.timestampMs < windowMs);

  const hookSegments = (input.transcript ?? []).filter((s) => s.timestampMs < windowMs);
  const hookText = hookSegments.map((s) => s.text.trim()).join(" ").trim();
  const wordCount = hookText ? hookText.split(/\s+/).length : 0;
  const wordsPerSecond = hookText ? Number((wordCount / (windowMs / 1000)).toFixed(2)) : null;

  const sceneCutCount = (input.sceneDetection?.changes ?? []).filter(
    (c) => c.isCut && c.timestampMs < windowMs
  ).length;
  const visionEventCount = inWin(input.visionEvents).length;

  // Loudness of the hook vs the rest of the video (real EBU R128 curve).
  let loudnessVsRestDb: number | null = null;
  const loud = input.audioDsp?.loudnessSeries ?? [];
  if (loud.length >= 6) {
    const hookLoud = loud.filter((p) => p.tSec * 1000 < windowMs).map((p) => p.momentaryLufs);
    const restLoud = loud.filter((p) => p.tSec * 1000 >= windowMs).map((p) => p.momentaryLufs);
    if (hookLoud.length && restLoud.length) {
      const avg = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
      loudnessVsRestDb = Number((avg(hookLoud) - avg(restLoud)).toFixed(1));
    }
  }

  const available = hookText.length > 0 || visionEventCount > 0;

  return {
    available,
    reason: available
      ? null
      : "Aucune parole ni élément visuel détecté dans les 15 premières secondes — impossible d'analyser le hook.",
    windowMs,
    firstWords: hookText ? hookText.slice(0, 200) : null,
    wordsPerSecond,
    sceneCutCount,
    visionEventCount,
    loudnessVsRestDb,
    promise: null,
    promiseDeliveredAtMs: null,
    consistency: "indetermine",
    observations: [],
    recommendations: [],
    aiUsed: false,
  };
}

export function buildHookPrompt(
  base: HookAnalysis,
  fullTranscript: TranscriptSegment[] | null
): { system: string; user: string } {
  const system = `Tu analyses le HOOK (les ~15 premières secondes) d'une vidéo YouTube, pour un créateur.
On te donne : les mesures objectives déjà calculées, la parole du hook, et un résumé de la suite.
Ton travail : identifier la PROMESSE faite au spectateur, dire si le reste de la vidéo la tient, et donner
des recommandations concrètes. Ce sont des HYPOTHÈSES, jamais des certitudes.
Réponds UNIQUEMENT avec ce JSON :
{"promise": string|null, "promiseDeliveredAtMs": number|null, "consistency": "coherent|partiel|incoherent|indetermine",
 "observations": [string], "recommendations": [string]}
- promise : ce que le hook laisse attendre. null si aucune promesse claire.
- promiseDeliveredAtMs : moment (ms) où le contenu tient la promesse, sinon null.
- observations : constats sur rythme, parole, visuel, promesse (2 à 4).
- recommendations : conseils concrets et actionnables (2 à 4).
Pas de texte hors du JSON.`;

  const rest = (fullTranscript ?? [])
    .filter((s) => s.timestampMs >= base.windowMs)
    .map((s) => s.text.trim())
    .join(" ")
    .slice(0, 3000);

  const user = `Mesures objectives du hook :
- Fenêtre analysée : ${base.windowMs} ms
- Débit de parole : ${base.wordsPerSecond ?? "n/a"} mots/s
- Coupes de plan : ${base.sceneCutCount}
- Événements visuels détectés : ${base.visionEventCount}
- Écart de volume hook vs reste : ${base.loudnessVsRestDb ?? "n/a"} LU

Parole du hook :
"${base.firstWords ?? "(aucune parole détectée)"}"

Reste de la vidéo (transcription, tronquée) :
${rest || "(indisponible)"}

Renvoie le JSON demandé.`;

  return { system, user };
}

const CONSISTENCY = new Set<HookAnalysis["consistency"]>([
  "coherent", "partiel", "incoherent", "indetermine",
]);

export function parseHookResponse(raw: string, base: HookAnalysis): HookAnalysis {
  const parsed = parseModelJson(raw);
  if (!parsed.ok || !parsed.value) return base;
  try {
    const p = parsed.value as Record<string, unknown>;
    const consistency = p.consistency as HookAnalysis["consistency"];
    return {
      ...base,
      promise: typeof p.promise === "string" && p.promise.trim() ? p.promise.trim() : null,
      promiseDeliveredAtMs:
        typeof p.promiseDeliveredAtMs === "number" && Number.isFinite(p.promiseDeliveredAtMs)
          ? Math.max(0, Math.round(p.promiseDeliveredAtMs))
          : null,
      consistency: CONSISTENCY.has(consistency) ? consistency : "indetermine",
      observations: Array.isArray(p.observations)
        ? (p.observations as unknown[]).map(String).filter(Boolean).slice(0, 5)
        : [],
      recommendations: Array.isArray(p.recommendations)
        ? (p.recommendations as unknown[]).map(String).filter(Boolean).slice(0, 5)
        : [],
      aiUsed: true,
    };
  } catch {
    return base;
  }
}
