import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getModel } from "@/lib/ai/providers/registry";
import { getT } from "@/i18n/server";
import { ChannelCard } from "@/components/dashboard/ChannelCard";
import { LyraPageContext } from "@/components/lyra/LyraPageContext";
import { CommunityOnboardingBanner } from "@/components/community/CommunityOnboardingBanner";
import { getMyPublicProfile } from "@/lib/community/profile";
import { SOCIAL_ENABLED } from "@/lib/features";
import { FolderKanban, Sparkles } from "lucide-react";

const CATEGORY_KEY: Record<string, string> = {
  VISION: "dashboard.catVision",
  AUDIO: "dashboard.catAudio",
  TRANSCRIPTION: "dashboard.catTranscription",
  VIDEO: "dashboard.catVideo",
  TEXT: "dashboard.catText",
};

const PROJECT_STATUS_KEY: Record<string, string> = {
  IDEA: "projects.statusIdea",
  IN_PROGRESS: "projects.statusInProgress",
  READY: "projects.statusReady",
  PUBLISHED: "projects.statusPublished",
};

export default async function DashboardPage() {
  const session = await auth();
  const userId = session!.user.id;
  const { t } = await getT();

  const [preferences, recentProjects, communityProfile] = await Promise.all([
    prisma.modelPreference.findMany({ where: { userId }, orderBy: { category: "asc" } }),
    prisma.project.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      take: 4,
    }),
    getMyPublicProfile(userId),
  ]);

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <LyraPageContext description={t("dashboard.lyraContext")} />

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {t("dashboard.welcome", {
            name: session?.user?.name?.split(" ")[0] ?? t("dashboard.welcomeFallback"),
          })}
        </h1>
        <p className="mt-1 text-sm text-muted">{t("dashboard.subtitle")}</p>
      </div>

      {SOCIAL_ENABLED && !communityProfile && <CommunityOnboardingBanner />}

      <ChannelCard />

      <section>
        <h2 className="mb-3 text-sm font-semibold text-muted">{t("dashboard.modelsInUse")}</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {preferences.map((pref) => {
            const model = getModel(pref.providerId);
            return (
              <div key={pref.category} className="rounded-xl border border-border bg-surface p-4">
                <p className="text-xs text-muted">{t(CATEGORY_KEY[pref.category] ?? pref.category)}</p>
                <p className="mt-1 text-sm font-medium">{model?.label ?? pref.providerId}</p>
                <p className="mt-1 text-[11px] text-muted">
                  {pref.mode === "CLOUD" ? t("cloudBadge") : t("localBadge")} · {pref.tier}
                </p>
              </div>
            );
          })}
        </div>
        <Link href="/settings" className="mt-3 inline-block text-xs text-accent hover:underline">
          {t("dashboard.editInSettings")}
        </Link>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-border bg-surface p-6">
          <div className="mb-3 flex items-center gap-2">
            <FolderKanban size={16} className="text-accent" />
            <h2 className="text-sm font-semibold">{t("dashboard.recentProjects")}</h2>
          </div>
          {recentProjects.length === 0 ? (
            <p className="text-sm text-muted">
              {t("dashboard.noProjects1")}
              <Link href="/projects" className="text-accent hover:underline">
                {t("dashboard.noProjectsLink")}
              </Link>
              {t("dashboard.noProjects2")}
            </p>
          ) : (
            <ul className="space-y-2">
              {recentProjects.map((p) => (
                <li key={p.id} className="flex items-center justify-between text-sm">
                  <span>{p.title}</span>
                  <span className="text-xs text-muted">
                    {t(PROJECT_STATUS_KEY[p.status] ?? p.status)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-surface p-6">
          <div className="mb-3 flex items-center gap-2">
            <Sparkles size={16} className="text-accent" />
            <h2 className="text-sm font-semibold">{t("dashboard.lyraSummary")}</h2>
          </div>
          <p className="text-sm text-muted">
            {t("dashboard.lyraSummary1")}
            <Link href="/content/analyzed" className="text-accent hover:underline">
              {t("dashboard.lyraSummaryLink")}
            </Link>
            {t("dashboard.lyraSummary2")}
          </p>
        </div>
      </section>
    </div>
  );
}
