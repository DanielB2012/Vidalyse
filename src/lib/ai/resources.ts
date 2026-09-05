import { prisma } from "@/lib/prisma";
import { defaultModelFor } from "./providers/registry";
import type { AICategory } from "./providers/types";

const CATEGORIES: AICategory[] = ["VISION", "AUDIO", "TRANSCRIPTION", "VIDEO", "TEXT"];

// Sets up a new user's model preferences (one per category, free-by-default).
// No credit rows are seeded: provider quotas live with the provider, and the
// user enters the real remaining balance manually in Settings — see
// src/lib/ai/credits.ts.
export async function ensureDefaultUserResources(userId: string) {
  await prisma.$transaction(
    CATEGORIES.map((category) => {
      const model = defaultModelFor(category);
      return prisma.modelPreference.upsert({
        where: { userId_category: { userId, category } },
        update: {},
        create: {
          userId,
          category,
          mode: model.mode,
          tier: model.tier,
          providerId: model.id,
        },
      });
    })
  );
}
