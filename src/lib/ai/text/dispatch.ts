import { getModel } from "@/lib/ai/providers/registry";
import { runClaudeText, isTextProviderConfigured as isClaudeConfigured } from "./anthropic";
import { runGeminiText, isGeminiTextProviderConfigured } from "./gemini";
import { runOllamaText, isOllamaTextReachable } from "./ollama";

interface TextRequest {
  providerId: string;
  systemPrompt: string;
  userMessage: string;
  maxTokens: number;
}

// The dispatcher is the one place that knows how a ModelEntry's `runtime`
// maps to a real implementation. Callers (Lyra, the pipeline's text
// synthesis stage) never import Anthropic/Gemini directly — they just pass
// whichever providerId the user has configured in Settings.
export async function runText(params: TextRequest): Promise<string> {
  const model = getModel(params.providerId);
  if (!model) throw new Error("Modèle Texte introuvable.");

  switch (model.runtime) {
    case "anthropic":
      return runClaudeText({
        tier: model.tier,
        systemPrompt: params.systemPrompt,
        userMessage: params.userMessage,
        maxTokens: params.maxTokens,
      });
    case "gemini":
      return runGeminiText({
        tier: model.tier,
        systemPrompt: params.systemPrompt,
        userMessage: params.userMessage,
        maxTokens: params.maxTokens,
      });
    case "ollama-text":
      if (!model.runtimeModelId) throw new Error(`Modèle Ollama non configuré pour "${model.label}".`);
      return runOllamaText({
        model: model.runtimeModelId,
        systemPrompt: params.systemPrompt,
        userMessage: params.userMessage,
      });
    default:
      throw new Error(`Le modèle Texte "${model.label}" n'est pas encore intégré.`);
  }
}

export async function isTextRuntimeConfigured(providerId: string): Promise<boolean> {
  const model = getModel(providerId);
  if (!model) return false;
  if (model.runtime === "anthropic") return isClaudeConfigured();
  if (model.runtime === "gemini") return isGeminiTextProviderConfigured();
  if (model.runtime === "ollama-text") return isOllamaTextReachable();
  return false;
}
