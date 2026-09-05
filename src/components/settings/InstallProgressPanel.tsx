"use client";

import { CheckCircle2, AlertTriangle, Loader2, CircleDashed } from "lucide-react";
import { useT } from "@/i18n/LanguageProvider";

export interface InstallItemState {
  key: string;
  label: string;
  status: "pending" | "active" | "done" | "error";
  percent: number | null;
  stageText: string;
  etaText: string | null;
  elapsedText: string | null;
}

export function InstallProgressPanel({ items }: { items: InstallItemState[] }) {
  const { t } = useT();
  const doneCount = items.filter((i) => i.status === "done").length;

  return (
    <div className="rounded-xl border border-border bg-surface-raised p-3 text-xs">
      <p className="mb-2 font-medium text-foreground">
        {t(items.length > 1 ? "install.panelHeaderPlural" : "install.panelHeader", {
          done: doneCount,
          total: items.length,
        })}
      </p>
      <div className="space-y-1.5">
        {items.map((it) => (
          <div key={it.key} className="flex items-center justify-between gap-3 text-muted">
            <span className="flex min-w-0 items-center gap-1.5">
              {it.status === "done" ? (
                <CheckCircle2 size={12} className="shrink-0 text-success" />
              ) : it.status === "error" ? (
                <AlertTriangle size={12} className="shrink-0 text-danger" />
              ) : it.status === "active" ? (
                <Loader2 size={12} className="shrink-0 animate-spin" />
              ) : (
                <CircleDashed size={12} className="shrink-0" />
              )}
              <span className="truncate">{it.label}</span>
            </span>
            <span className="shrink-0 text-[11px]">
              {it.status === "active" && (
                <>
                  {t(it.stageText)}
                  {it.percent !== null && ` ${it.percent}%`}
                  {it.elapsedText && ` — ${it.elapsedText}`}
                  {it.etaText && ` — ${it.etaText}`}
                </>
              )}
              {it.status === "done" && t("install.stDone")}
              {it.status === "error" && t("install.stError")}
              {it.status === "pending" && t("install.stPending")}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
