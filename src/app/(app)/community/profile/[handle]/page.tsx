import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { getT } from "@/i18n/server";
import { formatDate } from "@/lib/format";
import { LyraPageContext } from "@/components/lyra/LyraPageContext";
import { getVisiblePublicProfile } from "@/lib/community/profile";
import { listPublicationsForProfile } from "@/lib/community/publish";
import { likedPublicVideoIds } from "@/lib/community/likes";
import { getFollowState } from "@/lib/community/follow";
import { hasBlocked } from "@/lib/community/block";
import { VideoCard } from "@/components/community/VideoCard";
import { FollowButton } from "@/components/community/FollowButton";
import { MessageButton } from "@/components/community/MessageButton";
import { BlockButton } from "@/components/moderation/BlockButton";
import { ReportButton } from "@/components/moderation/ReportButton";
import { ArrowLeft, Heart, Users, Award } from "lucide-react";

export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  const session = await auth();
  const { t, locale } = await getT();

  const visible = await getVisiblePublicProfile(handle, session?.user?.id ?? null);
  if (!visible) notFound();

  const { profile, isOwner } = visible;
  const viewerId = session?.user?.id ?? null;
  const [publications, follow, blockedByMe] = await Promise.all([
    listPublicationsForProfile(profile.userId),
    getFollowState(viewerId, profile.userId),
    viewerId && !isOwner ? hasBlocked(viewerId, profile.userId) : Promise.resolve(false),
  ]);
  const likedIds = session?.user?.id
    ? await likedPublicVideoIds(session.user.id, publications.map((p) => p.id))
    : new Set<string>();
  const displayName = profile.displayName || `@${profile.handle}`;
  const avatar = profile.avatarUrl || profile.youtubeChannelLink?.thumbnailUrl || null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <LyraPageContext description={t("communityProfile.lyraContext", { handle: profile.handle })} />

      <Link href="/community" className="flex items-center gap-1.5 text-sm text-muted hover:text-foreground">
        <ArrowLeft size={15} />
        {t("communityProfile.back")}
      </Link>

      {isOwner && !profile.isPublic && (
        <div className="rounded-xl border border-border-strong bg-surface-raised p-3 text-xs text-muted">
          {t("communityProfile.ownerPrivatePreview")}{" "}
          <Link href="/profile" className="text-accent hover:underline">
            {t("community.editProfile")}
          </Link>
        </div>
      )}

      <div className="flex items-start gap-4 rounded-2xl border border-border bg-surface p-5">
        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-full bg-surface-raised">
          {avatar && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatar} alt="" className="h-full w-full object-cover" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h1 className="text-xl font-semibold tracking-tight">{displayName}</h1>
              <p className="text-xs text-muted">@{profile.handle}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {!isOwner && !blockedByMe && <MessageButton targetUserId={profile.userId} />}
              <FollowButton
                targetUserId={profile.userId}
                initialFollowing={follow.following}
                initialFollowerCount={follow.followerCount}
                isSelf={isOwner || blockedByMe}
              />
              {!isOwner && <ReportButton targetType="profile" targetId={profile.userId} compact />}
              {!isOwner && <BlockButton targetUserId={profile.userId} initialBlocked={blockedByMe} />}
            </div>
          </div>
          {profile.bio && <p className="mt-2 text-sm text-muted">{profile.bio}</p>}
          <p className="mt-2 text-[11px] text-muted">
            {t("communityProfile.memberSince", {
              date: formatDate(profile.createdAt.toISOString(), locale),
            })}
          </p>
        </div>
      </div>

      {/* Community stats — badges & streak land in Phase D */}
      <div className="grid grid-cols-3 gap-3">
        <StatTile icon={<Heart size={14} />} label={t("communityProfile.publications")} value={String(publications.length)} />
        <StatTile icon={<Users size={14} />} label={t("communityProfile.followers")} value={String(follow.followerCount)} />
        <StatTile icon={<Award size={14} />} label={t("profile.badges")} value="0" />
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold text-muted">{t("communityProfile.publishedVideos")}</h2>
        {publications.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border-strong bg-surface/50 p-6 text-sm text-muted">
            {t("communityProfile.noVideos")}
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
            {publications.map((p) => {
              const thumb =
                p.source === "youtube"
                  ? p.thumbnailUrl
                  : p.thumbnailUrl
                    ? `/api/community/${p.publicId}/thumbnail`
                    : null;
              return (
                <VideoCard
                  key={p.id}
                  publicId={p.publicId}
                  title={p.title ?? ""}
                  thumbnailUrl={thumb}
                  creatorHandle={profile.handle}
                  creatorName={profile.displayName}
                  creatorAvatarUrl={profile.avatarUrl}
                  like={{ liked: likedIds.has(p.id), count: p._count.likes }}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function StatTile({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4 text-center">
      <p className="flex items-center justify-center gap-1 text-lg font-semibold">{value}</p>
      <p className="mt-0.5 flex items-center justify-center gap-1 text-xs text-muted">
        {icon}
        {label}
      </p>
    </div>
  );
}
