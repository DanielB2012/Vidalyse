import { GoogleGenAI } from "@google/genai";
import { getGeminiApiKey, isGeminiKeyConfigured } from "./gemini-key";

let client: GoogleGenAI | null = null;
let clientKey: string | null = null;

export async function isGeminiConfigured(): Promise<boolean> {
  return isGeminiKeyConfigured();
}

export async function getGeminiClient(): Promise<GoogleGenAI> {
  const apiKey = await getGeminiApiKey();
  if (!apiKey) {
    throw new Error(
      "Aucune clé API Gemini. Ajoute ta clé dans Paramètres → IA & Lyra (onglet Simple) pour utiliser un modèle en ligne."
    );
  }
  // Rebuild only when the key changes (user updates it in Settings).
  if (!client || clientKey !== apiKey) {
    client = new GoogleGenAI({ apiKey });
    clientKey = apiKey;
  }
  return client;
}

// Real, free-tier-eligible Gemini models (no credit card required) — the 2.5
// series was deprecated for new API keys shortly after we first checked, so
// this mapping was re-verified with a live test call against a real key
// rather than trusted from docs alone. gemini-3.1-pro-preview exists but
// returned 429 (quota exceeded) on a fresh free-tier key, so PRO stays on a
// Flash model rather than claiming a "Pro" tier that doesn't actually work.
export const TIER_TO_GEMINI_MODEL = {
  LIGHT: "gemini-3.1-flash-lite",
  MEDIUM: "gemini-3.5-flash",
  PRO: "gemini-3.6-flash",
} as const;
