import Link from "next/link";
import { auth } from "@/auth";
import { getT } from "@/i18n/server";
import { prisma } from "@/lib/prisma";
import { LyraPageContext } from "@/components/lyra/LyraPageContext";
import { searchCommunity } from "@/lib/community/search";
import { searchYoutube } from "@/lib/youtube/search";
import { followStates } from "@/lib/community/follow";
import { getChannelFollowState } from "@/lib/community/channelFollow";
import { CommunitySearchBar } from "@/components/community/CommunitySearchBar";
import { VideoCard } from "@/components/community/VideoCard";
import { FollowButton } from "@/components/community/FollowButton";
import { YoutubeFollowButton } from "@/components/community/YoutubeFollowButton";
import { ArrowLeft } from "lucide-react";

export default async function CommunitySearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const session = await auth();
  const userId = session!.user.id;
  const { t } = await getT();

  const [community, youtube] = await Promise.all([
    searchCommunity({ q }),
    searchYoutube(userId, q),
  ]);

  // Which YouTube channels in the results are also on Vidalyse (public profile)?
  const ytChannelIds = youtube.channels.map((c) => c.channelId);
  const vidalyseByChannel = new Map<string, { handle: string; userId: string }>();
  const ytFollowByChannel = new Map<string, { following: boolean; count: number }>();
  if (ytChannelIds.length) {
    const rows = await prisma.channel.findMany({
      where: { youtubeId: { in: ytChannelIds }, user: { publicProfile: { isPublic: true } } },
      select: {
        youtubeId: true,
        userId: true,
        user: { select: { publicProfile: { select: { handle: true } } } },
      },
    });
    for (const r of rows) {
      if (r.user.publicProfile?.handle) {
        vidalyseByChannel.set(r.youtubeId, { handle: r.user.publicProfile.handle, userId: r.userId });
      }
    }
    // Follow state: Vidalyse user-follows for members, channel-follows for the rest.
    const memberIds = [...vidalyseByChannel.values()].map((v) => v.userId);
    const memberFollow = await followStates(userId, memberIds);
    const nonMemberChannels = ytChannelIds.filter((id) => !vidalyseByChannel.has(id));
    const nonMemberFollow = await Promise.all(
      nonMemberChannels.map((id) => getChannelFollowState(userId, id).then((s) => [id, s] as const))
    );
    for (const [id, s] of nonMemberFollow) ytFollowByChannel.set(id, s);
    for (const [chId, v] of vidalyseByChannel) {
      const s = memberFollow.get(v.userId);
      if (s) ytFollowByChannel.set(chId, { following: s.following, count: s.followerCount });
    }
  }

  const q2 = community.q;
  const nothing =
    community.creators.length === 0 &&
    community.videos.length === 0 &&
    youtube.videos.length === 0 &&
    youtube.channels.length === 0;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <LyraPageContext description={t("communitySearch.lyraContext", { q: q2 || "" })} />

      <Link href="/community" className="flex items-center gap-1.5 text-sm text-muted hover:text-foreground">
        <ArrowLeft size={15} />
        {t("communityWatch.back")}
      </Link>

      <CommunitySearchBar initialQuery={q2} />

      {q2.length < 2 ? (
        <p className="text-sm text-muted">{t("communitySearch.hint")}</p>
      ) : nothing ? (
        <p className="text-sm text-muted">{t("communitySearch.empty", { q: q2 })}</p>
      ) : (
        <>
          {community.creators.length > 0 && (
            <Section title={t("communitySearch.creators")}>
              <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {community.creators.map((c) => (
                  <li key={c.handle}>
                    <CreatorRow
                      href={`/community/profile/${c.handle}`}
                      name={c.displayName || `@${c.handle}`}
                      sub={`@${c.handle}`}
                      avatarUrl={c.avatarUrl}
                    />
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {community.videos.length > 0 && (
            <Section title={t("communitySearch.videos")}>
              <div className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
                {community.videos.map((v) => (
                  <VideoCard
                    key={v.publicId}
                    publicId={v.publicId}
                    title={v.title}
                    thumbnailUrl={v.thumbnailUrl}
                    creatorHandle={v.creatorHandle}
                    creatorName={v.creatorName}
                  />
                ))}
              </div>
            </Section>
          )}

          {youtube.channels.length > 0 && (
            <Section title={t("communitySearch.ytChannels")}>
              <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {youtube.channels.map((c) => {
                  const member = vidalyseByChannel.get(c.channelId);
                  const fs = ytFollowByChannel.get(c.channelId);
                  return (
                    <li
                      key={c.channelId}
                      className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3"
                    >
                      <CreatorRow
                        href={
                          member
                            ? `/community/profile/${member.handle}`
                            : `https://www.youtube.com/channel/${c.channelId}`
                        }
                        external={!member}
                        name={c.title}
                        sub={member ? `@${member.handle}` : t("communitySearch.onYoutube")}
                        avatarUrl={c.thumbnailUrl}
                        bare
                      />
                      <span className="ml-auto shrink-0">
                        {member ? (
                          <FollowButton
                            targetUserId={member.userId}
                            initialFollowing={fs?.following ?? false}
                            initialFollowerCount={fs?.count ?? 0}
                            showCount={false}
                          />
                        ) : (
                          <YoutubeFollowButton
                            youtubeChannelId={c.channelId}
                            channelTitle={c.title}
                            thumbnailUrl={c.thumbnailUrl}
                            initialFollowing={fs?.following ?? false}
                            initialCount={fs?.count ?? 0}
                          />
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </Section>
          )}

          {youtube.videos.length > 0 && (
            <Section title={t("communitySearch.ytVideos")}>
              <div className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
                {youtube.videos.map((v) => (
                  <VideoCard
                    key={v.videoId}
                    href={`/community/yt/${v.videoId}`}
                    publicId={v.videoId}
                    title={v.title}
                    thumbnailUrl={v.thumbnailUrl}
                    creatorHandle=""
                    creatorName={v.channelTitle}
                    disableCreatorLink
                    youtubeLike={{ youtubeVideoId: v.videoId, channelId: v.channelId, title: v.title }}
                  />
                ))}
              </div>
            </Section>
          )}
        </>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="mb-2 text-sm font-semibold text-muted">{title}</h2>
      {children}
    </div>
  );
}

function CreatorRow({
  href,
  name,
  sub,
  avatarUrl,
  external = false,
  bare = false,
}: {
  href: string;
  name: string;
  sub: string;
  avatarUrl: string | null;
  external?: boolean;
  /** No card chrome — for when the parent already draws the row container. */
  bare?: boolean;
}) {
  const inner = (
    <>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-raised">
        {avatarUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
        )}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">{name}</span>
        <span className="block truncate text-[11px] text-muted">{sub}</span>
      </span>
    </>
  );
  const cls = bare
    ? "flex min-w-0 items-center gap-3"
    : "flex items-center gap-3 rounded-xl border border-border bg-surface p-3 hover:border-border-strong";
  return external ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
      {inner}
    </a>
  ) : (
    <Link href={href} className={cls}>
      {inner}
    </Link>
  );
}
