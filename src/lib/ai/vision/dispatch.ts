import { getModel } from "@/lib/ai/providers/registry";
import type { StructuredEvent } from "@/lib/ai/providers/types";
import { analyzeFrames as analyzeFramesWithClaude, isVisionProviderConfigured as isClaudeVisionConfigured } from "./claude-vision";
import { analyzeFramesWithGemini, isGeminiVisionProviderConfigured } from "./gemini-vision";
import { analyzeFramesWithOllama, isOllamaVisionReachable } from "./ollama-vision";

interface FrameInput {
  path: string;
  timestampMs: number;
}

export async function runVision(providerId: string, frames: FrameInput[]): Promise<StructuredEvent[]> {
  const model = getModel(providerId);
  if (!model) throw new Error("Modèle Vision introuvable.");

  switch (model.runtime) {
    case "anthropic":
      return analyzeFramesWithClaude(frames, model.tier);
    case "gemini":
      return analyzeFramesWithGemini(frames, model.tier);
    case "ollama-vision":
      if (!model.runtimeModelId) throw new Error(`Modèle Ollama non configuré pour "${model.label}".`);
      return analyzeFramesWithOllama(model.runtimeModelId, frames);
    default:
      throw new Error(`Le modèle Vision "${model.label}" n'est pas encore intégré.`);
  }
}

export async function isVisionRuntimeConfigured(providerId: string): Promise<boolean> {
  const model = getModel(providerId);
  if (!model) return false;
  if (model.runtime === "anthropic") return isClaudeVisionConfigured();
  if (model.runtime === "gemini") return isGeminiVisionProviderConfigured();
  if (model.runtime === "ollama-vision") return isOllamaVisionReachable();
  return false;
}
