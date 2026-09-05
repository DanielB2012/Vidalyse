"use client";

import { useState, useTransition } from "react";
import { Flag, Loader2, X } from "lucide-react";
import { reportAction } from "@/app/(app)/moderation/actions";
import { useT } from "@/i18n/LanguageProvider";
import type { ReportTargetType } from "@/lib/moderation/report";

export function ReportButton({
  targetType,
  targetId,
  // Small icon-only trigger for tight spaces (a chat bubble); a labeled
  // button otherwise (a profile page).
  compact = false,
}: {
  targetType: ReportTargetType;
  targetId: string;
  compact?: boolean;
}) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit() {
    const trimmed = reason.trim();
    if (!trimmed || pending) return;
    startTransition(async () => {
      const res = await reportAction({ targetType, targetId, reason: trimmed });
      if (res.ok) {
        setSent(true);
        setReason("");
      }
    });
  }

  return (
    <div className="relative inline-block">
      <button
        onClick={() => setOpen((v) => !v)}
        title={t("moderation.report")}
        className={
          compact
            ? "flex h-6 w-6 items-center justify-center rounded-md text-muted transition hover:bg-surface-raised hover:text-danger"
            : "flex items-center gap-1.5 rounded-full border border-border-strong px-3.5 py-1.5 text-xs font-semibold text-foreground transition hover:bg-surface-raised"
        }
      >
        <Flag size={compact ? 12 : 13} />
        {!compact && t("moderation.report")}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-10 mt-2 w-64 rounded-xl border border-border-strong bg-surface p-3 shadow-xl">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold">{t("moderation.reportTitle")}</p>
            <button onClick={() => setOpen(false)} className="text-muted hover:text-foreground">
              <X size={14} />
            </button>
          </div>
          {sent ? (
            <p className="text-xs text-muted">{t("moderation.reportSent")}</p>
          ) : (
            <>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                placeholder={t("moderation.reportPlaceholder")}
                className="w-full resize-none rounded-lg border border-border-strong bg-surface-raised/40 px-2.5 py-1.5 text-xs outline-none"
              />
              <button
                onClick={submit}
                disabled={pending || !reason.trim()}
                className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-danger/60 bg-danger/10 px-3 py-1.5 text-xs font-semibold text-danger transition hover:bg-danger/20 disabled:opacity-50"
              >
                {pending && <Loader2 size={12} className="animate-spin" />}
                {t("moderation.reportSubmit")}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
