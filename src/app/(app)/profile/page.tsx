import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getT } from "@/i18n/server";
import { LyraPageContext } from "@/components/lyra/LyraPageContext";
import { ChannelCard } from "@/components/dashboard/ChannelCard";
import { CommunityProfileSection } from "@/components/community/CommunityProfileSection";
import { getMyPublicProfile } from "@/lib/community/profile";
import { SOCIAL_ENABLED } from "@/lib/features";

export default async function ProfilePage() {
  const session = await auth();
  const { t } = await getT();
  const [projectCount, communityProfile, youtubeChannelLinks] = await Promise.all([
    prisma.project.count({ where: { userId: session!.user.id } }),
    getMyPublicProfile(session!.user.id),
    prisma.youtubeChannelLink.findMany({
      where: { userId: session!.user.id },
      orderBy: { createdAt: "asc" },
      select: { id: true, title: true, handle: true },
    }),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <LyraPageContext description={t("profile.lyraContext")} />

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("profile.title")}</h1>
        <p className="mt-1 text-sm text-muted">{session?.user?.email}</p>
      </div>

      <ChannelCard />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label={t("profile.projectsCreated")} value={String(projectCount)} />
        <StatTile label={t("profile.analysesDone")} value="0" />
        <StatTile label={t("profile.streak")} value="—" />
        <StatTile label={t("profile.badges")} value="0" />
      </div>

      {SOCIAL_ENABLED && (
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
          channels={youtubeChannelLinks.map((c) => ({ id: c.id, title: c.title ?? c.id, handle: c.handle }))}
        />
      )}

      <div className="rounded-2xl border border-dashed border-border-strong bg-surface/50 p-6 text-sm text-muted">
        {t("profile.comingNote")}
      </div>
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4 text-center">
      <p className="text-lg font-semibold">{value}</p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  );
}
