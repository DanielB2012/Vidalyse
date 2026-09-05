"use client";

import { useState, useTransition } from "react";
import { Loader2, Check, Bell } from "lucide-react";
import clsx from "clsx";
import { toggleFollowAction } from "@/app/(app)/community/actions";
import { useT } from "@/i18n/LanguageProvider";

interface Props {
  targetUserId: string;
  initialFollowing: boolean;
  initialFollowerCount: number;
  isSelf?: boolean;
  showCount?: boolean;
}

export function FollowButton({
  targetUserId,
  initialFollowing,
  initialFollowerCount,
  isSelf = false,
  showCount = true,
}: Props) {
  const { t } = useT();
  const [following, setFollowing] = useState(initialFollowing);
  const [count, setCount] = useState(initialFollowerCount);
  const [pending, startTransition] = useTransition();

  function toggle() {
    if (isSelf) return;
    const prevF = following;
    const prevC = count;
    setFollowing(!prevF);
    setCount(prevC + (prevF ? -1 : 1));
    startTransition(async () => {
      const res = await toggleFollowAction(targetUserId);
      if (res.ok) {
        setFollowing(res.following);
        setCount(res.followerCount);
      } else {
        setFollowing(prevF);
        setCount(prevC);
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      {showCount && (
        <span className="text-xs text-muted">{t("communityWatch.subscribers", { count })}</span>
      )}
      {!isSelf && (
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
      )}
    </div>
  );
}
