"use client";

import { useState, useTransition } from "react";
import { Heart } from "lucide-react";
import clsx from "clsx";
import { toggleYoutubeLikeAction } from "@/app/(app)/community/actions";
import { useT } from "@/i18n/LanguageProvider";

interface Props {
  youtubeVideoId: string;
  channelId: string;
  title?: string | null;
  thumbnailUrl?: string | null;
  /** compact = icon + count only (for cards); default shows any notice inline. */
  compact?: boolean;
}

export function YoutubeLikeButton({ youtubeVideoId, channelId, title, thumbnailUrl, compact }: Props) {
  const { t } = useT();
  const [liked, setLiked] = useState(false);
  const [count, setCount] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle() {
    setNotice(null);
    const prevLiked = liked;
    const prevCount = count;
    setLiked(!prevLiked);
    setCount(prevCount + (prevLiked ? -1 : 1));

    startTransition(async () => {
      const res = await toggleYoutubeLikeAction({ youtubeVideoId, channelId, title, thumbnailUrl });
      if (res.ok) {
        setLiked(res.liked);
        setCount(res.count);
      } else {
        setLiked(prevLiked);
        setCount(prevCount);
        setNotice(
          res.reason === "creator_not_on_vidalyse"
            ? t("communityFeed.creatorNotOnVidalyse")
            : t("communityFeed.likeFailed")
        );
      }
    });
  }

  return (
    <span className={compact ? "inline-flex flex-col" : "inline-flex flex-col gap-1"}>
      <button
        onClick={toggle}
        disabled={pending}
        aria-pressed={liked}
        aria-label={liked ? t("communityFeed.unlike") : t("communityFeed.like")}
        className={clsx(
          "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition disabled:opacity-60",
          liked
            ? "border-accent/40 bg-accent/10 text-accent"
            : "border-border-strong text-muted hover:text-foreground"
        )}
      >
        <Heart size={13} className={liked ? "fill-current" : undefined} />
        {count}
      </button>
      {notice && <span className="text-[11px] text-muted">{notice}</span>}
    </span>
  );
}
