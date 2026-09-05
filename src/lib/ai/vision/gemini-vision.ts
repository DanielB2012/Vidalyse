import fs from "node:fs/promises";
import { createUserContent, createPartFromBase64, createPartFromText } from "@google/genai";
import type { ModelTier, StructuredEvent } from "@/lib/ai/providers/types";
import { getGeminiClient, isGeminiConfigured, TIER_TO_GEMINI_MODEL } from "@/lib/ai/gemini-client";
import { parseModelJson } from "@/lib/analysis/json";

export { isGeminiConfigured as isGeminiVisionProviderConfigured };

const VISION_SYSTEM_PROMPT = `Tu es le module Vision de Vidalyse. On te donne une série de frames extraites
d'une vidéo, dans l'ordre chronologique, chacune associée à son timestamp en millisecondes.
Décris uniquement ce que tu observes réellement dans ces images : changements de scène, texte à l'écran,
objets ou mouvements notables, changements de composition.
Réponds UNIQUEMENT avec un objet JSON de la forme :
{"events": [{"timestampMs": number, "type": "scene_change" | "on_screen_text" | "object" | "movement" | "other", "description": string}]}
N'invente rien qui ne soit pas visible. Si rien de notable ne se passe, renvoie une liste vide. Pas de texte hors du JSON.`;

interface FrameInput {
  path: string;
  timestampMs: number;
}

export async function analyzeFramesWithGemini(
  frames: FrameInput[],
  tier: ModelTier
): Promise<StructuredEvent[]> {
  if (!(await isGeminiConfigured())) {
    throw new Error(
      "Aucune clé API Gemini : ajoute ta clé dans Paramètres → IA & Lyra (onglet Simple) pour utiliser la Vision en ligne."
    );
  }
  if (frames.length === 0) return [];

  const parts = await Promise.all(
    frames.flatMap((frame, i) => [
      Promise.resolve(createPartFromText(`Frame ${i + 1} — timestamp ${frame.timestampMs}ms`)),
      fs.readFile(frame.path).then((data) => createPartFromBase64(data.toString("base64"), "image/jpeg")),
    ])
  );

  const client = await getGeminiClient();
  const response = await client.models.generateContent({
    model: TIER_TO_GEMINI_MODEL[tier],
    contents: [createUserContent(parts)],
    config: {
      systemInstruction: VISION_SYSTEM_PROMPT,
      maxOutputTokens: 2048,
    },
  });

  return parseVisionEvents(response.text ?? "");
}

function parseVisionEvents(raw: string): StructuredEvent[] {
  const parsed = parseModelJson<{ events?: unknown }>(raw);
  if (!parsed.ok || !parsed.value || !Array.isArray(parsed.value.events)) return [];
  return (parsed.value.events as Record<string, unknown>[])
    .filter((e) => typeof e.timestampMs === "number" && typeof e.description === "string")
    .map((e) => ({
      timestampMs: Math.max(0, Math.round(e.timestampMs as number)),
      type: typeof e.type === "string" && e.type ? (e.type as string) : "other",
      description: (e.description as string).trim().slice(0, 500),
    }))
    .filter((e) => e.description.length > 0);
}
