import type { ModelTier } from "../providers/types";
import { getGeminiClient, isGeminiConfigured, TIER_TO_GEMINI_MODEL } from "../gemini-client";

export { isGeminiConfigured as isGeminiTextProviderConfigured };

export async function runGeminiText(params: {
  tier: ModelTier;
  systemPrompt: string;
  userMessage: string;
  maxTokens: number;
}): Promise<string> {
  if (!(await isGeminiConfigured())) {
    throw new Error(
      "Aucune clé API Gemini : ajoute ta clé dans Paramètres → IA & Lyra (onglet Simple) pour utiliser le modèle Texte en ligne."
    );
  }

  const client = await getGeminiClient();
  const response = await client.models.generateContent({
    model: TIER_TO_GEMINI_MODEL[params.tier],
    contents: params.userMessage,
    config: {
      systemInstruction: params.systemPrompt,
      maxOutputTokens: params.maxTokens,
    },
  });

  return response.text ?? "";
}
