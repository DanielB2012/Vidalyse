import fs from "node:fs/promises";
import Anthropic from "@anthropic-ai/sdk";
import type { ModelTier, StructuredEvent } from "@/lib/ai/providers/types";
import { TIER_TO_CLAUDE_MODEL } from "@/lib/ai/claude-models";

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

export function isVisionProviderConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

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

export async function analyzeFrames(
  frames: FrameInput[],
  tier: ModelTier
): Promise<StructuredEvent[]> {
  if (!isVisionProviderConfigured()) {
    throw new Error("ANTHROPIC_API_KEY manquant : la Vision Cloud n'est pas configurée.");
  }
  if (frames.length === 0) return [];

  const imageBlocks = await Promise.all(
    frames.map(async (frame) => {
      const data = await fs.readFile(frame.path);
      return {
        type: "image" as const,
        source: {
          type: "base64" as const,
          media_type: "image/jpeg" as const,
          data: data.toString("base64"),
        },
      };
    })
  );

  const labelBlocks = frames.map((frame, i) => ({
    type: "text" as const,
    text: `Frame ${i + 1} — timestamp ${frame.timestampMs}ms`,
  }));

  // Interleave label + image so Claude can associate each image with its
  // real timestamp instead of guessing an order.
  const content = frames.flatMap((_, i) => [labelBlocks[i], imageBlocks[i]]);

  const response = await getClient().messages.create({
    model: TIER_TO_CLAUDE_MODEL[tier],
    max_tokens: 2048,
    system: VISION_SYSTEM_PROMPT,
    messages: [{ role: "user", content }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  const raw = textBlock && "text" in textBlock ? textBlock.text : "";

  return parseVisionEvents(raw);
}

function parseVisionEvents(raw: string): StructuredEvent[] {
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return [];

  try {
    const parsed = JSON.parse(jsonMatch[0]) as {
      events?: Array<{ timestampMs: number; type: string; description: string }>;
    };
    if (!Array.isArray(parsed.events)) return [];
    return parsed.events
      .filter((e) => typeof e.timestampMs === "number" && typeof e.description === "string")
      .map((e) => ({
        timestampMs: e.timestampMs,
        type: e.type ?? "other",
        description: e.description,
        // No confidence field: Claude doesn't emit a calibrated score, and
        // spec §88 forbids inventing one.
      }));
  } catch {
    return [];
  }
}
