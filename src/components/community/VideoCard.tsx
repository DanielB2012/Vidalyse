"use client";

import Link from "next/link";
import { Play } from "lucide-react";
import { useT } from "@/i18n/LanguageProvider";
import { LikeButton } from "./LikeButton";
import { YoutubeLikeButton } from "./YoutubeLikeButton";
import { ReportButton } from "@/components/moderation/ReportButton";

interface Props {
  publicId: string;
  title: string;
  thumbnailUrl: string | null;
  creatorHandle: string;
  creatorName: string | null;
  creatorAvatarUrl?: string | null;
  /** Right-hand meta line under the creator (date, external link…). */
  metaLine?: string | null;
  like?: { liked: boolean; count: number };
  /** For raw YouTube videos: renders a like button that mirrors + likes the
   *  video, or tells the viewer the creator isn't on Vidalyse. */
  youtubeLike?: { youtubeVideoId: string; channelId: string; title: string | null };
  /** Override the target (e.g. a raw-YouTube watch route). Defaults to the
   *  community watch page for `publicId`. */
  href?: string;
  /** Render the creator name as plain text (no Vidalyse profile to link to). */
  disableCreatorLink?: boolean;
}

// A YouTube-style video card: 16:9 poster that opens the watch page, then the
// creator avatar + title + name + meta below.
export function VideoCard({
  publicId,
  title,
  thumbnailUrl,
  creatorHandle,
  creatorName,
  creatorAvatarUrl,
  metaLine,
  like,
  youtubeLike,
  href,
  disableCreatorLink = false,
}: Props) {
  const { t } = useT();
  const target = href ?? `/community/watch/${publicId}`;
  const profileHref = `/community/profile/${creatorHandle}`;

  return (
    <article className="flex flex-col">
      <Link
        href={target}
        aria-label={title || t("community.untitled")}
        className="group relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-xl border border-border bg-surface-raised"
      >
        {thumbnailUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumbnailUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
        )}
        <span className="absolute inset-0 bg-black/0 transition group-hover:bg-black/25" />
        <span className="relative flex h-11 w-11 items-center justify-center rounded-full bg-white/90 text-black opacity-0 shadow transition group-hover:opacity-100">
          <Play size={20} className="ml-0.5 fill-current" />
        </span>
      </Link>

      <div className="mt-2 flex gap-2.5">
        {disableCreatorLink ? (
          <span className="mt-0.5 block h-8 w-8 shrink-0 overflow-hidden rounded-full bg-surface-raised">
            {creatorAvatarUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={creatorAvatarUrl} alt="" className="h-full w-full object-cover" />
            )}
          </span>
        ) : (
          <Link href={profileHref} className="mt-0.5 shrink-0">
            <span className="block h-8 w-8 overflow-hidden rounded-full bg-surface-raised">
              {creatorAvatarUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={creatorAvatarUrl} alt="" className="h-full w-full object-cover" />
              )}
            </span>
          </Link>
        )}
        <div className="min-w-0 flex-1">
          <Link href={target}>
            <h3 className="line-clamp-2 text-sm font-medium leading-snug">
              {title || t("community.untitled")}
            </h3>
          </Link>
          {disableCreatorLink ? (
            <span className="mt-1 block truncate text-xs text-muted">
              {creatorName || `@${creatorHandle}`}
            </span>
          ) : (
            <Link
              href={profileHref}
              className="mt-1 block truncate text-xs text-muted hover:text-foreground"
            >
              {creatorName || `@${creatorHandle}`}
            </Link>
          )}
          <div className="mt-1 flex items-center gap-2 text-xs text-muted">
            {like && (
              <>
                <LikeButton publicId={publicId} initialLiked={like.liked} initialCount={like.count} />
                {metaLine && <span>·</span>}
              </>
            )}
            {youtubeLike && (
              <>
                <YoutubeLikeButton
                  youtubeVideoId={youtubeLike.youtubeVideoId}
                  channelId={youtubeLike.channelId}
                  title={youtubeLike.title}
                  thumbnailUrl={thumbnailUrl}
                  compact
                />
                {metaLine && <span>·</span>}
              </>
            )}
            {metaLine && <span className="truncate">{metaLine}</span>}
            {!disableCreatorLink && (
              <ReportButton targetType="video" targetId={publicId} compact />
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
