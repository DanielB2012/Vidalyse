import Anthropic from "@anthropic-ai/sdk";
import type { ModelTier } from "../providers/types";
import { TIER_TO_CLAUDE_MODEL } from "../claude-models";

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

export function isTextProviderConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export async function runClaudeText(params: {
  tier: ModelTier;
  systemPrompt: string;
  userMessage: string;
  maxTokens: number;
}): Promise<string> {
  if (!isTextProviderConfigured()) {
    throw new Error("ANTHROPIC_API_KEY manquant : le modèle Texte Cloud n'est pas configuré.");
  }

  const response = await getClient().messages.create({
    model: TIER_TO_CLAUDE_MODEL[params.tier],
    max_tokens: params.maxTokens,
    system: params.systemPrompt,
    messages: [{ role: "user", content: params.userMessage }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  return textBlock && "text" in textBlock ? textBlock.text : "";
}
