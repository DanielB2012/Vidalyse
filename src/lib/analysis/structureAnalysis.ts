import type { TranscriptSegment } from "@/lib/pipeline/types";
import { parseModelJson } from "./json";
import type { SceneDetectionResult, StructureSegment, VideoStructure } from "./types";

export interface StructureInput {
  durationMs: number;
  transcript: TranscriptSegment[] | null;
  sceneDetection: SceneDetectionResult | null;
}

const CTA_KEYWORDS = [
  "abonne", "abonner", "abonnez", "abonnement",
  "like", "pouce", "j'aime",
  "commente", "commentaire", "commentez",
  "partage", "partagez",
  "cloche", "notification", "notif",
  "lien en description", "description", "en dessous",
  "patreon", "tipeee", "membre", "adhésion", "adhesion",
];

const CONCLUSION_KEYWORDS = [
  "en conclusion", "pour conclure", "pour finir", "pour résumer", "pour resumer",
  "voilà pour", "voila pour", "merci d'avoir regardé", "merci d'avoir regarde",
  "on se retrouve", "à la prochaine", "a la prochaine", "c'était", "c'etait",
];

// Heuristic first pass over real timestamps + transcript keywords. Every label
// carries a confidence and its basis; when there's not enough to say anything
// beyond "the video starts and ends", `undetermined` is set rather than
// inventing a full arc.
export function analyzeStructure(input: StructureInput): VideoStructure {
  const D = input.durationMs;
  const segments: StructureSegment[] = [];
  const transcript = (input.transcript ?? []).filter((s) => s.text.trim().length > 0);
  const cuts = (input.sceneDetection?.changes ?? []).filter((c) => c.isCut);

  if (D < 3000) {
    return {
      segments: [],
      undetermined: true,
      note: "Vidéo trop courte pour une analyse de structure.",
      aiRefined: false,
    };
  }

  const hookEnd = Math.min(15000, Math.round(D * 0.15));
  segments.push({
    kind: "hook",
    startMs: 0,
    endMs: hookEnd,
    label: "Hook (accroche)",
    confidence: "moyenne",
    basis: ["Fenêtre standard des premières secondes (0–15 s)"],
  });

  const introEnd = Math.min(Math.round(D * 0.1), 25000);
  if (introEnd > hookEnd) {
    segments.push({
      kind: "intro",
      startMs: 0,
      endMs: introEnd,
      label: "Introduction",
      confidence: transcript.length ? "moyenne" : "faible",
      basis: ["Premier ~10 % de la vidéo", transcript.length ? "Présence de parole" : "Aucune parole détectée"],
    });
  }

  const outroStart = Math.max(D - 30000, Math.round(D * 0.9));
  segments.push({
    kind: "outro",
    startMs: outroStart,
    endMs: D,
    label: "Outro",
    confidence: "faible",
    basis: ["Dernier ~10 % de la vidéo"],
  });

  // CTA detection from transcript keywords.
  for (const seg of transcript) {
    const low = seg.text.toLowerCase();
    if (CTA_KEYWORDS.some((k) => low.includes(k))) {
      segments.push({
        kind: "appel_a_action",
        startMs: seg.timestampMs,
        endMs: seg.endTimestampMs || seg.timestampMs + 3000,
        label: "Appel à l'action",
        confidence: "moyenne",
        basis: [`Mots-clés d'appel à l'action dans la parole : « ${seg.text.trim().slice(0, 80)} »`],
      });
    }
  }

  // Conclusion phrasing near the end.
  const lateConclusion = transcript.find(
    (s) => s.timestampMs > D * 0.6 && CONCLUSION_KEYWORDS.some((k) => s.text.toLowerCase().includes(k))
  );
  if (lateConclusion) {
    segments.push({
      kind: "conclusion",
      startMs: lateConclusion.timestampMs,
      endMs: lateConclusion.endTimestampMs || Math.min(D, lateConclusion.timestampMs + 8000),
      label: "Conclusion",
      confidence: "moyenne",
      basis: [`Formulation de clôture : « ${lateConclusion.text.trim().slice(0, 80)} »`],
    });
  }

  // Topic shifts: a scene cut that coincides with a >3.5 s gap in speech.
  if (transcript.length >= 4) {
    for (let i = 1; i < transcript.length; i++) {
      const gap = transcript[i].timestampMs - (transcript[i - 1].endTimestampMs || transcript[i - 1].timestampMs);
      if (gap < 3500) continue;
      const near = cuts.find((c) => Math.abs(c.timestampMs - transcript[i].timestampMs) < 4000);
      if (near) {
        segments.push({
          kind: "changement_de_sujet",
          startMs: transcript[i].timestampMs,
          endMs: transcript[i].timestampMs + 1000,
          label: "Changement de sujet probable",
          confidence: "faible",
          basis: ["Pause de parole > 3,5 s", "Coupe de plan détectée au même endroit"],
        });
      }
    }
  }

  // Body: whatever sits between the intro and the outro.
  const bodyStart = introEnd;
  const bodyEnd = outroStart;
  if (bodyEnd - bodyStart > D * 0.15) {
    segments.push({
      kind: "developpement",
      startMs: bodyStart,
      endMs: bodyEnd,
      label: "Développement",
      confidence: transcript.length ? "moyenne" : "faible",
      basis: ["Partie centrale de la vidéo"],
    });
  }

  segments.sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);

  const undetermined = transcript.length === 0 && cuts.length === 0;
  return {
    segments,
    undetermined,
    note: undetermined
      ? "Ni transcription ni changements de plan exploitables : structure estimée uniquement à partir des durées."
      : null,
    aiRefined: false,
  };
}

// Optional AI refinement of the heuristic labels. Returns the input unchanged
// on any parsing failure — the heuristic result is never discarded.
export function buildStructureRefinementPrompt(
  structure: VideoStructure,
  transcript: TranscriptSegment[] | null,
  durationMs: number
): { system: string; user: string } {
  const system = `Tu affines un découpage structurel de vidéo YouTube déjà pré-calculé par des règles simples.
Tu reçois ce découpage + la transcription horodatée. Corrige/complète les libellés SEULEMENT si la
transcription le justifie clairement. N'invente aucun segment sans appui. Si un élément reste indéterminable,
laisse-le tel quel.
Réponds UNIQUEMENT avec un JSON : {"segments":[{"kind":"intro|hook|developpement|changement_de_sujet|passage_important|conclusion|appel_a_action|outro","startMs":number,"endMs":number,"label":string,"confidence":"faible|moyenne|elevee","basis":[string]}]}
Pas de texte hors du JSON.`;

  const segLines = structure.segments
    .map((s) => `- ${s.kind} [${s.startMs}–${s.endMs}ms] ${s.label} (confiance ${s.confidence})`)
    .join("\n");
  const trLines = (transcript ?? [])
    .map((t) => `[${t.timestampMs}ms] ${t.text.trim()}`)
    .join("\n")
    .slice(0, 8000);

  const user = `Durée totale : ${durationMs} ms.

Découpage heuristique actuel :
${segLines || "(vide)"}

Transcription :
${trLines || "(indisponible)"}

Renvoie le JSON du découpage affiné.`;

  return { system, user };
}

const KINDS = new Set<StructureSegment["kind"]>([
  "intro", "hook", "developpement", "changement_de_sujet", "passage_important", "conclusion", "appel_a_action", "outro",
]);
const CONFS = new Set<StructureSegment["confidence"]>(["faible", "moyenne", "elevee"]);

export function parseStructureRefinement(raw: string, durationMs: number): StructureSegment[] | null {
  const result = parseModelJson<{ segments?: unknown }>(raw);
  if (!result.ok || !result.value) return null;
  try {
    const parsed = result.value;
    if (!Array.isArray(parsed.segments)) return null;
    const out: StructureSegment[] = [];
    for (const s of parsed.segments as Record<string, unknown>[]) {
      const kind = s.kind as StructureSegment["kind"];
      const confidence = s.confidence as StructureSegment["confidence"];
      if (!KINDS.has(kind)) continue;
      const startMs = Math.max(0, Math.min(durationMs, Number(s.startMs)));
      const endMs = Math.max(startMs, Math.min(durationMs, Number(s.endMs)));
      if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) continue;
      out.push({
        kind,
        startMs: Math.round(startMs),
        endMs: Math.round(endMs),
        label: typeof s.label === "string" && s.label.trim() ? s.label.trim().slice(0, 80) : kind,
        confidence: CONFS.has(confidence) ? confidence : "faible",
        basis: Array.isArray(s.basis) ? (s.basis as unknown[]).map(String).slice(0, 4) : ["Affiné par l'IA Texte"],
      });
    }
    return out.length ? out.sort((a, b) => a.startMs - b.startMs) : null;
  } catch {
    return null;
  }
}
