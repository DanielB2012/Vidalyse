"use client";

import { useState, useTransition } from "react";
import { Heart } from "lucide-react";
import clsx from "clsx";
import { toggleLikeAction } from "@/app/(app)/community/actions";
import { useT } from "@/i18n/LanguageProvider";

interface Props {
  publicId: string;
  initialLiked: boolean;
  initialCount: number;
}

export function LikeButton({ publicId, initialLiked, initialCount }: Props) {
  const { t } = useT();
  const [liked, setLiked] = useState(initialLiked);
  const [count, setCount] = useState(initialCount);
  const [pending, startTransition] = useTransition();

  function toggle() {
    const prevLiked = liked;
    const prevCount = count;
    // Optimistic.
    setLiked(!prevLiked);
    setCount(prevCount + (prevLiked ? -1 : 1));

    startTransition(async () => {
      const res = await toggleLikeAction(publicId);
      if (res.ok) {
        setLiked(res.liked);
        setCount(res.count);
      } else {
        setLiked(prevLiked);
        setCount(prevCount);
      }
    });
  }

  return (
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
  );
}
