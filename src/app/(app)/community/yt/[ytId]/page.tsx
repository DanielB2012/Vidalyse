import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { getT } from "@/i18n/server";
import { LyraPageContext } from "@/components/lyra/LyraPageContext";
import { prisma } from "@/lib/prisma";
import { extractYoutubeVideoId, getAuthorizedYoutubeClient } from "@/lib/youtube/client";
import { listCommunityFeed } from "@/lib/community/feed";
import { getFollowState } from "@/lib/community/follow";
import { getChannelFollowState } from "@/lib/community/channelFollow";
import { YoutubeLikeButton } from "@/components/community/YoutubeLikeButton";
import { FollowButton } from "@/components/community/FollowButton";
import { YoutubeFollowButton } from "@/components/community/YoutubeFollowButton";
import { ArrowLeft } from "lucide-react";

interface VideoMeta {
  title: string;
  author: string;
  channelId: string;
}

async function fetchOEmbed(id: string): Promise<VideoMeta | null> {
  try {
    const url = `https://www.youtube.com/oembed?url=${encodeURIComponent(
      `https://www.youtube.com/watch?v=${id}`
    )}&format=json`;
    const res = await fetch(url, { signal: AbortSignal.timeout(4000), next: { revalidate: 3600 } });
    if (!res.ok) return null;
    const data = (await res.json()) as { title?: string; author_name?: string };
    return { title: data.title ?? "", author: data.author_name ?? "", channelId: "" };
  } catch {
    return null;
  }
}

// One videos.list call (1 quota unit) — reliable title + channelId, needed so
// the like button can resolve the creator.
async function fetchVideoMeta(userId: string, id: string): Promise<VideoMeta | null> {
  try {
    const yt = await getAuthorizedYoutubeClient(userId);
    if (!yt) return fetchOEmbed(id);
    const res = await yt.videos.list({ part: ["snippet"], id: [id] });
    const sn = res.data.items?.[0]?.snippet;
    if (!sn) return fetchOEmbed(id);
    return {
      title: sn.title ?? "",
      author: sn.channelTitle ?? "",
      channelId: sn.channelId ?? "",
    };
  } catch {
    return fetchOEmbed(id);
  }
}

export default async function YoutubeWatchPage({
  params,
}: {
  params: Promise<{ ytId: string }>;
}) {
  const { ytId } = await params;
  const id = extractYoutubeVideoId(ytId);
  if (!id) notFound();

  const session = await auth();
  const userId = session!.user.id;
  const { t } = await getT();

  const [meta, more] = await Promise.all([
    fetchVideoMeta(userId, id),
    listCommunityFeed({ viewerId: userId, cursor: null, pageSize: 10 }),
  ]);
  const title = meta?.title || "YouTube";

  // Subscribe button: user-follow if this channel is on Vidalyse, else a
  // Vidalyse-side channel-follow for the raw YouTube channel.
  let vidalyseMember: { userId: string; handle: string | null } | null = null;
  let followState = { following: false, count: 0 };
  if (meta?.channelId) {
    const chan = await prisma.channel.findFirst({
      where: { youtubeId: meta.channelId },
      select: { userId: true, user: { select: { publicProfile: { select: { handle: true, isPublic: true } } } } },
    });
    if (chan?.user.publicProfile?.isPublic) {
      vidalyseMember = { userId: chan.userId, handle: chan.user.publicProfile.handle };
      const fs = await getFollowState(userId, chan.userId);
      followState = { following: fs.following, count: fs.followerCount };
    } else {
      followState = await getChannelFollowState(userId, meta.channelId);
    }
  }

  return (
    <div className="mx-auto max-w-[1400px]">
      <LyraPageContext description={t("communityWatch.lyraContext", { title })} />

      <Link
        href="/community"
        className="mb-3 flex items-center gap-1.5 text-sm text-muted hover:text-foreground"
      >
        <ArrowLeft size={15} />
        {t("communityWatch.back")}
      </Link>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-4">
          <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-border bg-black">
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${id}?rel=0`}
              title={title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              className="absolute inset-0 h-full w-full"
            />
          </div>

          <div>
            <h1 className="text-lg font-semibold leading-snug">{title}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted">
              {meta?.author &&
                (vidalyseMember?.handle ? (
                  <Link
                    href={`/community/profile/${vidalyseMember.handle}`}
                    className="font-medium text-foreground hover:underline"
                  >
                    {meta.author}
                  </Link>
                ) : (
                  <span className="font-medium text-foreground">{meta.author}</span>
                ))}
              {meta?.channelId &&
                (vidalyseMember ? (
                  <FollowButton
                    targetUserId={vidalyseMember.userId}
                    initialFollowing={followState.following}
                    initialFollowerCount={followState.count}
                    showCount={false}
                  />
                ) : (
                  <YoutubeFollowButton
                    youtubeChannelId={meta.channelId}
                    channelTitle={meta.author}
                    initialFollowing={followState.following}
                    initialCount={followState.count}
                  />
                ))}
              {meta?.channelId && (
                <YoutubeLikeButton youtubeVideoId={id} channelId={meta.channelId} title={meta.title} />
              )}
              <span className="rounded-full border border-border-strong px-2 py-0.5 text-[11px]">
                {t("communitySearch.onYoutube")}
              </span>
              <a
                href={`https://www.youtube.com/watch?v=${id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-foreground"
              >
                {t("communityFeed.watchOnYoutube")} ↗
              </a>
            </div>
          </div>
        </div>

        <aside className="space-y-3">
          <h2 className="text-sm font-semibold text-muted">{t("communityWatch.more")}</h2>
          {more.items.map((s) => (
            <Link
              key={s.publicId}
              href={`/community/watch/${s.publicId}`}
              className="flex gap-2 rounded-lg p-1 hover:bg-surface-raised"
            >
              <span className="relative aspect-video w-40 shrink-0 overflow-hidden rounded-md border border-border bg-surface-raised">
                {s.thumbnailUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={s.thumbnailUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="line-clamp-2 text-xs font-medium leading-snug">
                  {s.title || t("community.untitled")}
                </span>
                <span className="mt-1 block truncate text-[11px] text-muted">
                  {s.creator.displayName || `@${s.creator.handle}`}
                </span>
              </span>
            </Link>
          ))}
        </aside>
      </div>
    </div>
  );
}
