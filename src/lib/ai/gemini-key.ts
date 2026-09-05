import { prisma } from "@/lib/prisma";

// Vidalyse ships with NO Gemini API key. To use an online (Cloud) model the
// user pastes their own free key in Paramètres → IA & Lyra → onglet Simple;
// it lives in the local database (AppSetting), never in the repo.
//
// A key set in the environment (GEMINI_API_KEY) still wins — handy for power
// users and CI — but the app never depends on one being there.

const SETTING_KEY = "GEMINI_API_KEY";

function envKey(): string | null {
  const value = process.env.GEMINI_API_KEY?.trim();
  return value ? value : null;
}

/** The Gemini key actually in effect: env override first, then the user's. */
export async function getGeminiApiKey(): Promise<string | null> {
  const fromEnv = envKey();
  if (fromEnv) return fromEnv;
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: SETTING_KEY } });
    const value = row?.value.trim();
    return value ? value : null;
  } catch {
    // DB unreachable — treat as "no key" rather than crashing a call site.
    return null;
  }
}

export async function isGeminiKeyConfigured(): Promise<boolean> {
  return (await getGeminiApiKey()) !== null;
}

/** Where the effective key comes from — for honest UI copy, never the value. */
export async function getGeminiKeySource(): Promise<"env" | "user" | null> {
  if (envKey()) return "env";
  return (await isGeminiKeyConfigured()) ? "user" : null;
}

/** Env-only check for synchronous code paths (the model catalog). */
export function hasGeminiKeyInEnv(): boolean {
  return envKey() !== null;
}

/** Persist (or, with an empty string, clear) the user's own Gemini key. */
export async function setGeminiApiKey(value: string | null): Promise<void> {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) {
    await prisma.appSetting.deleteMany({ where: { key: SETTING_KEY } });
    return;
  }
  await prisma.appSetting.upsert({
    where: { key: SETTING_KEY },
    update: { value: trimmed },
    create: { key: SETTING_KEY, value: trimmed },
  });
}
