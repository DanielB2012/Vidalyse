"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, Loader2 } from "lucide-react";
import clsx from "clsx";
import { toggleBlockAction } from "@/app/(app)/moderation/actions";
import { useT } from "@/i18n/LanguageProvider";

export function BlockButton({
  targetUserId,
  initialBlocked,
  // After blocking, some views (a DM thread with someone you just blocked)
  // no longer make sense to stay on — pass a path to redirect to.
  redirectOnBlockTo,
}: {
  targetUserId: string;
  initialBlocked: boolean;
  redirectOnBlockTo?: string;
}) {
  const { t } = useT();
  const router = useRouter();
  const [blocked, setBlocked] = useState(initialBlocked);
  const [pending, startTransition] = useTransition();

  function onClick() {
    const next = !blocked;
    if (next && !window.confirm(t("moderation.blockConfirm"))) return;
    startTransition(async () => {
      const res = await toggleBlockAction(targetUserId);
      if (res.ok) {
        setBlocked(res.blocked);
        if (res.blocked && redirectOnBlockTo) router.push(redirectOnBlockTo);
      }
    });
  }

  return (
    <button
      onClick={onClick}
      disabled={pending}
      className={clsx(
        "flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition disabled:opacity-60",
        blocked
          ? "border-danger/60 bg-danger/10 text-danger hover:bg-danger/20"
          : "border-border-strong text-foreground hover:bg-surface-raised"
      )}
    >
      {pending ? <Loader2 size={13} className="animate-spin" /> : <Ban size={13} />}
      {blocked ? t("moderation.unblock") : t("moderation.block")}
    </button>
  );
}
