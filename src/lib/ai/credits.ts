import { prisma } from "@/lib/prisma";
import { getModel } from "./providers/registry";
import type { ProviderRuntime } from "./providers/types";

// Vidalyse ships free models only (Gemini + local Ollama), so nothing is
// billed and nothing is gated. These guards stay as a safety net: if a paid
// runtime is ever re-added to the catalog, its calls would again be checked
// against a (manually entered) balance instead of running unbounded.
const PAID_RUNTIMES = new Set<ProviderRuntime>(["anthropic", "openai-whisper"]);

export function isPaidProvider(providerId: string): boolean {
  const m = getModel(providerId);
  return Boolean(m && m.mode === "CLOUD" && PAID_RUNTIMES.has(m.runtime));
}

// null => not tracked (free model, or no balance entered) -> never gate/decrement.
async function getTrackedRemaining(userId: string, providerId: string): Promise<number | null> {
  if (!isPaidProvider(providerId)) return null;
  const row = await prisma.creditBalance.findUnique({
    where: { userId_providerId: { userId, providerId } },
  });
  return row?.remaining ?? null;
}

export async function isProviderExhausted(userId: string, providerId: string): Promise<boolean> {
  const remaining = await getTrackedRemaining(userId, providerId);
  return remaining !== null && remaining <= 0;
}

export async function decrementProviderBalance(userId: string, providerId: string): Promise<void> {
  if (!isPaidProvider(providerId)) return;
  await prisma.creditBalance.updateMany({
    where: { userId, providerId, remaining: { not: null, gt: 0 } },
    data: { remaining: { decrement: 1 } },
  });
}
