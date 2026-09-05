import { auth, signOut } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getModelCatalog, getPackCategories, getPackModels, getRecommendedLocalTier } from "@/lib/ai/providers/registry";
import { isGeminiKeyConfigured, hasGeminiKeyInEnv } from "@/lib/ai/gemini-key";
import { isOllamaReachable, listInstalledOllamaModels, isOllamaModelInstalled } from "@/lib/ai/local/ollama-client";
import { isWhisperModelInstalled } from "@/lib/ai/local/whisper-client";
import { getSystemRamGB } from "@/lib/system/hardware";
import type { AICategory, ModelEntry, ModelTier, ProviderMode } from "@/lib/ai/providers/types";
import { getT } from "@/i18n/server";
import { AiModelsSection } from "@/components/settings/AiModelsSection";
import { DiagnosticsSection } from "@/components/settings/DiagnosticsSection";
import { AppearanceSection } from "@/components/settings/AppearanceSection";
import { ConnectedAccountsSection } from "@/components/settings/ConnectedAccountsSection";
import { ConnectedChannelsSection } from "@/components/settings/ConnectedChannelsSection";
import { ensurePrimaryChannelLink } from "@/lib/youtube/client";
import { CommunityProfileSection } from "@/components/community/CommunityProfileSection";
import { getMyPublicProfile } from "@/lib/community/profile";
import { SOCIAL_ENABLED } from "@/lib/features";
import { LyraPageContext } from "@/components/lyra/LyraPageContext";
import { LegalFooter } from "@/components/legal/LegalFooter";
import { DeleteAccountSection } from "@/components/settings/DeleteAccountSection";

const TIERS: ModelTier[] = ["LIGHT", "MEDIUM", "PRO"];

const CATEGORIES: AICategory[] = ["VISION", "AUDIO", "TRANSCRIPTION", "VIDEO", "TEXT"];

const COMING_SOON = [
  "settings.comingSoon.notifications",
  "settings.comingSoon.storage",
  "settings.comingSoon.security",
  "settings.comingSoon.extensions",
  "settings.comingSoon.about",
];

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ channelLinked?: string; channelError?: string }>;
}) {
  const session = await auth();
  const userId = session!.user.id;
  const { t } = await getT();
  const { channelLinked, channelError } = await searchParams;

  await ensurePrimaryChannelLink(userId);

  const [preferences, googleAccounts, youtubeChannelLinks, communityProfile] = await Promise.all([
    prisma.modelPreference.findMany({ where: { userId } }),
    prisma.account.findMany({ where: { userId, provider: "google" }, orderBy: { id: "asc" } }),
    prisma.youtubeChannelLink.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
    getMyPublicProfile(userId),
  ]);

  const connectedChannels = youtubeChannelLinks.map((c) => ({
    id: c.id,
    active: c.active,
    youtubeChannelId: c.youtubeChannelId,
    title: c.title ?? t("connectedChannels.unnamed"),
    handle: c.handle,
    thumbnailUrl: c.thumbnailUrl,
  }));

  // Cached googleName/googleEmail/googleImage are null for accounts linked
  // before this feature existed — for the one that's currently active, that's
  // just the session's own identity (this IS the account we're signed in
  // with), so fall back to it rather than showing a blank row.
  const connectedAccounts = googleAccounts.map((a) => ({
    id: a.id,
    active: a.active,
    scope: a.scope,
    name: a.googleName ?? (a.active ? session?.user?.name : null) ?? t("connectedAccounts.unnamed"),
    email: a.googleEmail ?? (a.active ? session?.user?.email : null) ?? null,
    image: a.googleImage ?? (a.active ? session?.user?.image : null) ?? null,
  }));

  const geminiKeyConfigured = await isGeminiKeyConfigured();
  const geminiKeyFromEnv = hasGeminiKeyInEnv();
  const catalog = getModelCatalog({ geminiConfigured: geminiKeyConfigured });
  const ollamaReachable = await isOllamaReachable();
  const installedNames = ollamaReachable ? await listInstalledOllamaModels() : [];
  const isInstalled = (m: Pick<ModelEntry, "runtime" | "runtimeModelId">) => {
    if (!m.runtimeModelId) return false;
    if (m.runtime === "whisper-local") return isWhisperModelInstalled(m.runtimeModelId);
    return isOllamaModelInstalled(installedNames, m.runtimeModelId);
  };

  const localCatalog = catalog
    .filter((m) => m.mode === "LOCAL" && m.local)
    .map((m) => ({ ...m, local: m.local!, installed: isInstalled(m) }));

  // A tier only counts as "selected" for a pack when every category in it is
  // on that pack's mode AND tier — e.g. picking Cloud Medium must not leave
  // Local Medium looking selected too, or the user can't tell which is live.
  const currentTierFor = (categories: AICategory[], mode: ProviderMode): ModelTier | null => {
    const tiers = categories.map((c) => {
      const pref = preferences.find((p) => p.category === c);
      return pref && pref.mode === mode ? pref.tier : null;
    });
    if (tiers.some((t) => t === null)) return null;
    return new Set(tiers).size === 1 ? tiers[0] : null;
  };

  const localPackCategories = getPackCategories("LOCAL");
  const localPackTiers = TIERS.map((tier) => ({
    tier,
    models: getPackModels("LOCAL", tier).map((m) => ({
      providerId: m.id,
      category: m.category,
      categoryLabel: t(`category.${m.category}`),
      label: m.label,
      diskGB: m.local!.diskGB,
      ready: isInstalled(m),
    })),
  }));
  const currentLocalPackTier = currentTierFor(localPackCategories, "LOCAL");
  const systemRamGB = getSystemRamGB();
  const recommendedLocalTier = getRecommendedLocalTier(systemRamGB);

  const cloudPackCategories = getPackCategories("CLOUD");
  const cloudPackTiers = TIERS.map((tier) => ({
    tier,
    models: getPackModels("CLOUD", tier).map((m) => ({
      providerId: m.id,
      category: m.category,
      categoryLabel: t(`category.${m.category}`),
      label: m.label,
      ready: m.availability.status === "available",
      reason: m.availability.status !== "available" ? m.availability.reason : undefined,
    })),
  }));
  const currentCloudPackTier = currentTierFor(cloudPackCategories, "CLOUD");

  return (
    <div className="mx-auto max-w-4xl space-y-10">
      <LyraPageContext description={t("settings.lyraContext")} />

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("settings.title")}</h1>
      </div>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-muted">{t("settings.account")}</h2>
        <div className="flex items-center justify-between rounded-2xl border border-border bg-surface p-5">
          <div>
            <p className="text-sm font-medium">{session?.user?.name}</p>
            <p className="text-xs text-muted">{session?.user?.email}</p>
          </div>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <button className="rounded-lg border border-border-strong px-3 py-1.5 text-xs">
              {t("menu.signOut")}
            </button>
          </form>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-muted">{t("settings.youtube")}</h2>
        <p className="mb-3 text-xs text-muted">{t("connectedChannels.subtitle")}</p>
        {channelLinked && (
          <p className="mb-3 rounded-lg border border-success/40 bg-success/10 px-3 py-2 text-xs text-success">
            {t("connectedChannels.linkSuccess")}
          </p>
        )}
        {channelError && (
          <p className="mb-3 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
            {t(
              channelError === "denied"
                ? "connectedChannels.errorDenied"
                : channelError === "no_channel"
                  ? "connectedChannels.errorNoChannel"
                  : "connectedChannels.errorGeneric"
            )}
          </p>
        )}
        <ConnectedChannelsSection channels={connectedChannels} />
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-muted">{t("connectedAccounts.title")}</h2>
        <p className="mb-3 text-xs text-muted">{t("connectedAccounts.subtitle")}</p>
        <ConnectedAccountsSection accounts={connectedAccounts} />
      </section>

      <AiModelsSection
        categories={CATEGORIES}
        preferences={preferences}
        catalog={catalog}
        localPackCategories={localPackCategories}
        cloudPackCategories={cloudPackCategories}
        localPackTiers={localPackTiers}
        cloudPackTiers={cloudPackTiers}
        currentLocalPackTier={currentLocalPackTier}
        currentCloudPackTier={currentCloudPackTier}
        recommendedLocalTier={recommendedLocalTier}
        systemRamGB={systemRamGB}
        ollamaReachable={ollamaReachable}
        localCatalog={localCatalog}
        geminiKeyConfigured={geminiKeyConfigured}
        geminiKeyFromEnv={geminiKeyFromEnv}
      />

      {SOCIAL_ENABLED && (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-muted">{t("settings.communityProfile")}</h2>
          <CommunityProfileSection
            profile={
              communityProfile
                ? {
                    handle: communityProfile.handle,
                    displayName: communityProfile.displayName,
                    bio: communityProfile.bio,
                    avatarUrl: communityProfile.avatarUrl,
                    isPublic: communityProfile.isPublic,
                    autoIncludeYoutube: communityProfile.autoIncludeYoutube,
                    youtubeChannelLinkId: communityProfile.youtubeChannelLinkId,
                  }
                : null
            }
            channels={connectedChannels.map((c) => ({ id: c.id, title: c.title, handle: c.handle }))}
          />
        </section>
      )}

      <DiagnosticsSection />

      <AppearanceSection />

      <section>
        <h2 className="mb-3 text-sm font-semibold text-muted">{t("settings.costsHeading")}</h2>
        <p className="rounded-2xl border border-border bg-surface p-5 text-sm text-muted">
          {t("settings.costsBody")}
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-muted">{t("settings.legalHeading")}</h2>
        <div className="rounded-2xl border border-border bg-surface p-5">
          <LegalFooter className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm" />
        </div>
      </section>

      <DeleteAccountSection />

      <section>
        <h2 className="mb-3 text-sm font-semibold text-muted">{t("settings.otherCategories")}</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {COMING_SOON.map((key) => (
            <div
              key={key}
              className="rounded-xl border border-dashed border-border-strong bg-surface/50 p-4 text-center text-xs text-muted"
            >
              {t(key)}
              <div className="mt-1 text-[10px]">{t("settings.soon")}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
