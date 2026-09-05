import fs from "node:fs/promises";
import { ollamaChat, isOllamaReachable } from "@/lib/ai/local/ollama-client";
import type { StructuredEvent } from "@/lib/ai/providers/types";
import { parseModelJson } from "@/lib/analysis/json";

export { isOllamaReachable as isOllamaVisionReachable };

const VISION_SYSTEM_PROMPT = `Tu es le module Vision local de Vidalyse. On te donne plusieurs images extraites
d'une vidéo, dans l'ordre chronologique. Le message utilisateur liste le timestamp (en millisecondes)
correspondant à chaque image, dans le même ordre.
Décris uniquement ce que tu observes réellement : changements de scène, texte à l'écran, objets ou mouvements notables.
Réponds UNIQUEMENT avec un objet JSON de la forme :
{"events": [{"timestampMs": number, "type": "scene_change" | "on_screen_text" | "object" | "movement" | "other", "description": string}]}
N'invente rien. Si rien de notable ne se passe, renvoie une liste vide. Pas de texte hors du JSON.`;

interface FrameInput {
  path: string;
  timestampMs: number;
}

// Local vision models (LLaVA/moondream via Ollama) cost ~576+ tokens per image
// and default to a 4096-token context, so sending every frame in one call
// overflows it ("exceeds the available context size"). We send frames in small
// batches, raise num_ctx for headroom, and merge the results. A batch that
// still fails is skipped rather than killing the whole stage.
const FRAMES_PER_CALL = 4;
const NUM_CTX = 8192;

export async function analyzeFramesWithOllama(
  model: string,
  frames: FrameInput[]
): Promise<StructuredEvent[]> {
  if (frames.length === 0) return [];

  const events: StructuredEvent[] = [];
  let lastError: unknown = null;
  let batches = 0;
  let failed = 0;

  for (let start = 0; start < frames.length; start += FRAMES_PER_CALL) {
    batches++;
    const batch = frames.slice(start, start + FRAMES_PER_CALL);
    try {
      const images = await Promise.all(
        batch.map(async (f) => (await fs.readFile(f.path)).toString("base64"))
      );
      const timestampList = batch.map((f, i) => `Image ${i + 1} → ${f.timestampMs}ms`).join("\n");
      const userMessage = `Timestamps des images fournies, dans l'ordre :\n${timestampList}`;

      const raw = await ollamaChat(
        model,
        [
          { role: "system", content: VISION_SYSTEM_PROMPT },
          { role: "user", content: userMessage, images },
        ],
        { num_ctx: NUM_CTX }
      );
      events.push(...parseVisionEvents(raw));
    } catch (err) {
      failed++;
      lastError = err;
    }
  }

  // Only surface an error if nothing at all came back.
  if (failed === batches && lastError) {
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  return events.sort((a, b) => a.timestampMs - b.timestampMs);
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
