"use client";

import { useState, useTransition } from "react";
import { Loader2, Check, Bell } from "lucide-react";
import clsx from "clsx";
import { toggleChannelFollowAction } from "@/app/(app)/community/actions";
import { useT } from "@/i18n/LanguageProvider";

interface Props {
  youtubeChannelId: string;
  channelTitle?: string | null;
  thumbnailUrl?: string | null;
  initialFollowing?: boolean;
  initialCount?: number;
  showCount?: boolean;
}

// "Subscribe" to a YouTube channel that isn't on Vidalyse (or that we don't have
// pre-loaded follow state for). Vidalyse-side only.
export function YoutubeFollowButton({
  youtubeChannelId,
  channelTitle,
  thumbnailUrl,
  initialFollowing = false,
  initialCount = 0,
  showCount = false,
}: Props) {
  const { t } = useT();
  const [following, setFollowing] = useState(initialFollowing);
  const [count, setCount] = useState(initialCount);
  const [pending, startTransition] = useTransition();

  function toggle() {
    const prevF = following;
    const prevC = count;
    setFollowing(!prevF);
    setCount(prevC + (prevF ? -1 : 1));
    startTransition(async () => {
      const res = await toggleChannelFollowAction({ youtubeChannelId, channelTitle, thumbnailUrl });
      setFollowing(res.following);
      setCount(res.count);
    });
  }

  return (
    <span className="flex items-center gap-2">
      {showCount && (
        <span className="text-xs text-muted">{t("communityWatch.subscribers", { count })}</span>
      )}
      <button
        onClick={toggle}
        disabled={pending}
        className={clsx(
          "flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition disabled:opacity-60",
          following
            ? "border border-border-strong text-foreground hover:bg-surface-raised"
            : "bg-foreground text-surface hover:opacity-90"
        )}
      >
        {pending ? (
          <Loader2 size={13} className="animate-spin" />
        ) : following ? (
          <Check size={13} />
        ) : (
          <Bell size={13} />
        )}
        {following ? t("communityWatch.subscribed") : t("communityWatch.subscribe")}
      </button>
    </span>
  );
}
