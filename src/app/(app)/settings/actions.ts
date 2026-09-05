"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getModel, getPackModels } from "@/lib/ai/providers/registry";
import { setGeminiApiKey as persistGeminiApiKey } from "@/lib/ai/gemini-key";
import { deleteAccount } from "@/lib/account/deleteAccount";
import type { AICategory, ModelTier, ProviderMode } from "@/lib/ai/providers/types";

export async function setModelPreference(category: AICategory, providerId: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("unauthenticated");

  const model = getModel(providerId);
  if (!model || model.category !== category) throw new Error("invalid_model");

  // §20: never let the user silently pick a lightweight model without the warning
  // being visible — the UI surfaces this via the model's description; here we
  // just persist the choice.
  await prisma.modelPreference.upsert({
    where: { userId_category: { userId: session.user.id, category } },
    update: { mode: model.mode, tier: model.tier, providerId: model.id },
    create: {
      userId: session.user.id,
      category,
      mode: model.mode,
      tier: model.tier,
      providerId: model.id,
    },
  });

  revalidatePath("/settings");
  revalidatePath("/dashboard");
}

// The user's own Gemini API key for the online models. Vidalyse ships without
// one, so this is what makes a Cloud model actually work. Passing an empty
// string clears it. Never logged, never sent back to the client.
export async function setGeminiApiKey(key: string): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("unauthenticated");

  await persistGeminiApiKey(key);

  revalidatePath("/settings");
  revalidatePath("/dashboard");
}

// RGPD right-to-erasure (art. 17) — irreversible. The caller (DeleteAccountSection)
// signs the user out client-side right after this resolves, since the session's
// own User row no longer exists to sign out "as".
export async function deleteAccountAction(): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("unauthenticated");

  await deleteAccount(session.user.id);
}

// The simple Light/Medium/Pro "pack" selector: one tier, applied at once to
// every category that has full tier coverage for that mode (see getPackModels).
export async function setPackTier(mode: ProviderMode, tier: ModelTier) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("unauthenticated");

  const models = getPackModels(mode, tier);
  if (models.length === 0) throw new Error("empty_pack");

  await prisma.$transaction(
    models.map((model) =>
      prisma.modelPreference.upsert({
        where: { userId_category: { userId: session.user!.id, category: model.category } },
        update: { mode: model.mode, tier: model.tier, providerId: model.id },
        create: {
          userId: session.user!.id,
          category: model.category,
          mode: model.mode,
          tier: model.tier,
          providerId: model.id,
        },
      })
    )
  );

  revalidatePath("/settings");
  revalidatePath("/dashboard");
}
