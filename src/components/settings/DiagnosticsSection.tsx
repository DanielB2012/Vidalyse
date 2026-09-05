"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, AlertTriangle, XCircle, Loader2, RefreshCw, MinusCircle, ChevronRight } from "lucide-react";
import { useT } from "@/i18n/LanguageProvider";

type Status = "ok" | "not_configured" | "not_installed" | "unavailable" | "error";

interface Item {
  key: string;
  label: string;
  status: Status;
  detail: string;
  hint?: string;
}

const ICON: Record<Status, React.ReactNode> = {
  ok: <CheckCircle2 size={16} className="text-success" />,
  not_configured: <MinusCircle size={16} className="text-warning" />,
  not_installed: <MinusCircle size={16} className="text-warning" />,
  unavailable: <AlertTriangle size={16} className="text-warning" />,
  error: <XCircle size={16} className="text-danger" />,
};

const STATUS_KEY: Record<Status, string> = {
  ok: "diagnostics.statusOk",
  not_configured: "diagnostics.statusNotConfigured",
  not_installed: "diagnostics.statusNotInstalled",
  unavailable: "diagnostics.statusUnavailable",
  error: "diagnostics.statusError",
};

export function DiagnosticsSection() {
  const { t, locale } = useT();
  const [items, setItems] = useState<Item[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);

  const [embedBusy, setEmbedBusy] = useState(false);

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/diagnostics", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? t("diagnostics.failed"));
      setItems(data.items);
      setGeneratedAt(data.generatedAt);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("diagnostics.networkError"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const installEmbeddings = useCallback(async () => {
    setEmbedBusy(true);
    try {
      await fetch("/api/local-models/embeddings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "install" }),
      });
    } finally {
      setEmbedBusy(false);
      void run();
    }
  }, [run]);

  useEffect(() => {
    // Deferred so the first fetch's setState doesn't run synchronously in the effect body.
    const id = setTimeout(() => void run(), 0);
    return () => clearTimeout(id);
  }, [run]);

  const okCount = items?.filter((i) => i.status === "ok").length ?? 0;
  const total = items?.length ?? 0;
  const summary = !items
    ? t("diagnostics.summaryChecking")
    : okCount === total
      ? t("diagnostics.summaryAllOk")
      : t("diagnostics.summaryPartial", { ok: okCount, total });

  return (
    <details className="group rounded-2xl border border-border bg-surface">
      <summary className="flex cursor-pointer list-none items-center gap-2 p-4 text-sm">
        <ChevronRight
          size={14}
          className="shrink-0 text-muted transition-transform group-open:rotate-90"
        />
        <span className="font-semibold text-muted">{t("diagnostics.title")}</span>
        <span className="ml-auto text-xs text-muted">{summary}</span>
      </summary>

      <div className="border-t border-border p-4">
        <div className="mb-3 flex items-start justify-between gap-3">
          <p className="text-xs text-muted">{t("diagnostics.intro")}</p>
          <button
            onClick={run}
            disabled={loading}
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border-strong px-2.5 py-1 text-xs text-muted hover:text-foreground disabled:opacity-50"
          >
            {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            {t("diagnostics.refresh")}
          </button>
        </div>

        {error && <p className="mb-3 text-sm text-danger">{error}</p>}

        <div className="divide-y divide-border rounded-xl border border-border bg-surface-raised">
          {(items ?? []).map((item) => (
          <div key={item.key} className="flex items-start gap-3 p-4">
            <span className="mt-0.5 shrink-0">{ICON[item.status]}</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">
                {item.label}{" "}
                <span
                  className={
                    item.status === "ok"
                      ? "text-success"
                      : item.status === "error"
                        ? "text-danger"
                        : "text-warning"
                  }
                >
                  · {t(STATUS_KEY[item.status])}
                </span>
              </p>
              <p className="mt-0.5 text-xs text-muted">{item.detail}</p>
              {item.hint && <p className="mt-1 text-xs text-accent/80">{item.hint}</p>}
              {item.key === "embeddings" && item.status === "not_installed" && (
                <button
                  onClick={installEmbeddings}
                  disabled={embedBusy}
                  className="mt-1.5 flex items-center gap-1.5 rounded-md border border-border-strong px-2 py-1 text-xs text-muted hover:text-foreground disabled:opacity-50"
                >
                  {embedBusy ? <Loader2 size={11} className="animate-spin" /> : null}
                  {embedBusy ? t("diagnostics.installing") : t("diagnostics.installEmbeddings")}
                </button>
              )}
            </div>
          </div>
        ))}
        {!items && !error && (
          <div className="flex items-center gap-2 p-4 text-sm text-muted">
            <Loader2 size={14} className="animate-spin" /> {t("diagnostics.analyzing")}
          </div>
        )}
      </div>

        {generatedAt && (
          <p className="mt-2 text-[11px] text-muted">
            {t("diagnostics.lastCheck", {
              date: new Date(generatedAt).toLocaleString(locale === "en" ? "en-US" : "fr-FR"),
            })}
          </p>
        )}
      </div>
    </details>
  );
}
