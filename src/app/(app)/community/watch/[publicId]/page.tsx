import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { getT } from "@/i18n/server";
import { LyraPageContext } from "@/components/lyra/LyraPageContext";
import { getWatchVideo } from "@/lib/community/watch";
import { listCommunityFeed } from "@/lib/community/feed";
import { LikeButton } from "@/components/community/LikeButton";
import { FollowButton } from "@/components/community/FollowButton";
import { ArrowLeft } from "lucide-react";

export default async function WatchPage({
  params,
}: {
  params: Promise<{ publicId: string }>;
}) {
  const { publicId } = await params;
  const session = await auth();
  const viewerId = session?.user?.id ?? null;
  const { t, locale } = await getT();

  const video = await getWatchVideo(publicId, viewerId);
  if (!video) notFound();

  const more = await listCommunityFeed({ viewerId, cursor: null, pageSize: 12 });
  const suggestions = more.items.filter((i) => i.publicId !== publicId).slice(0, 10);

  const dateStr = new Intl.DateTimeFormat(locale === "en" ? "en-US" : "fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(video.publishedAt));

  return (
    <div className="mx-auto max-w-[1400px]">
      <LyraPageContext description={t("communityWatch.lyraContext", { title: video.title })} />

      <Link
        href="/community"
        className="mb-3 flex items-center gap-1.5 text-sm text-muted hover:text-foreground"
      >
        <ArrowLeft size={15} />
        {t("communityWatch.back")}
      </Link>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* Main column */}
        <div className="min-w-0 space-y-4">
          {video.youtubeVideoId ? (
            <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-border bg-black">
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${video.youtubeVideoId}?rel=0`}
                title={video.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                className="absolute inset-0 h-full w-full"
              />
            </div>
          ) : (
            <div className="aspect-video w-full overflow-hidden rounded-xl border border-border bg-surface-raised">
              {video.thumbnailUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={video.thumbnailUrl} alt="" className="h-full w-full object-cover" />
              )}
            </div>
          )}

          <h1 className="text-lg font-semibold leading-snug">
            {video.title || t("community.untitled")}
          </h1>

          {/* Creator row + subscribe + actions */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-y border-border py-3">
            <div className="flex items-center gap-3">
              <Link href={`/community/profile/${video.creator.handle}`} className="shrink-0">
                <span className="block h-10 w-10 overflow-hidden rounded-full bg-surface-raised">
                  {video.creator.avatarUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={video.creator.avatarUrl} alt="" className="h-full w-full object-cover" />
                  )}
                </span>
              </Link>
              <div className="min-w-0">
                <Link
                  href={`/community/profile/${video.creator.handle}`}
                  className="block truncate text-sm font-semibold hover:underline"
                >
                  {video.creator.displayName || `@${video.creator.handle}`}
                </Link>
                <FollowButton
                  targetUserId={video.creator.userId}
                  initialFollowing={video.creator.viewerFollows}
                  initialFollowerCount={video.creator.followerCount}
                  isSelf={video.creator.isSelf}
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <LikeButton
                publicId={video.publicId}
                initialLiked={video.likedByViewer}
                initialCount={video.likeCount}
              />
              {video.youtubeVideoId && (
                <a
                  href={`https://www.youtube.com/watch?v=${video.youtubeVideoId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-muted hover:text-foreground"
                >
                  {t("communityFeed.watchOnYoutube")} ↗
                </a>
              )}
            </div>
          </div>

          {/* Description */}
          <div className="rounded-xl border border-border bg-surface p-4 text-sm">
            <p className="text-xs font-medium text-muted">{dateStr}</p>
            {video.summary ? (
              <p className="mt-2 whitespace-pre-line text-muted">{video.summary}</p>
            ) : (
              <p className="mt-2 text-muted">
                {video.fromYoutube ? t("communityFeed.fromYoutube") : t("communityWatch.noDescription")}
              </p>
            )}
            {video.strengths.length > 0 && (
              <div className="mt-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                  {t("communityWatch.strengths")}
                </p>
                <ul className="mt-1.5 space-y-1 text-muted">
                  {video.strengths.map((s, i) => (
                    <li key={i}>· {s.text}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar — up next */}
        <aside className="space-y-3">
          <h2 className="text-sm font-semibold text-muted">{t("communityWatch.more")}</h2>
          {suggestions.length === 0 ? (
            <p className="text-xs text-muted">{t("communityWatch.noMore")}</p>
          ) : (
            suggestions.map((s) => (
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
                  <span className="text-[11px] text-muted">
                    {t("communityWatch.likesShort", { count: s.likeCount })}
                  </span>
                </span>
              </Link>
            ))
          )}
        </aside>
      </div>
    </div>
  );
}
