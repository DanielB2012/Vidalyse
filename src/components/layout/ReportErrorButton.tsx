"use client";

import { useState } from "react";
import { Bug, X, AlertTriangle } from "lucide-react";
import { useT } from "@/i18n/LanguageProvider";

// Spec §70/§72: present on every page. Posts to a Discord webhook
// (DISCORD_ERROR_WEBHOOK_URL) via /api/report-error — real send, real
// failure states, never a fake "sent" confirmation.
export function ReportErrorButton() {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("Bug");
  const [description, setDescription] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setTitle("");
    setCategory("Bug");
    setDescription("");
    setSent(false);
    setError(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/report-error", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, category, description }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? t("report.sendFailed"));
      } else {
        setSent(true);
      }
    } catch {
      setError(t("report.networkError"));
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full border border-border-strong bg-surface-raised px-4 py-2 text-xs font-medium text-muted shadow-lg transition hover:text-foreground"
      >
        <Bug size={14} />
        {t("report.button")}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => {
            setOpen(false);
            reset();
          }}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-border bg-surface p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold">{t("report.title")}</h2>
              <button
                onClick={() => {
                  setOpen(false);
                  reset();
                }}
                className="text-muted hover:text-foreground"
              >
                <X size={18} />
              </button>
            </div>

            {sent ? (
              <div className="space-y-3">
                <p className="text-sm text-success">{t("report.sent")}</p>
                <button
                  onClick={() => {
                    setOpen(false);
                    reset();
                  }}
                  className="rounded-lg border border-border-strong px-3 py-1.5 text-xs"
                >
                  {t("report.close")}
                </button>
              </div>
            ) : (
              <form className="space-y-3" onSubmit={submit}>
                <input
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={t("report.titlePlaceholder")}
                  className="w-full rounded-lg border border-border-strong bg-surface-raised px-3 py-2 text-sm placeholder:text-muted"
                />
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full rounded-lg border border-border-strong bg-surface-raised px-3 py-2 text-sm"
                >
                  <option value="Bug">{t("report.catBug")}</option>
                  <option value="Suggestion">{t("report.catSuggestion")}</option>
                  <option value="Autre">{t("report.catOther")}</option>
                </select>
                <textarea
                  required
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t("report.descPlaceholder")}
                  className="h-24 w-full resize-none rounded-lg border border-border-strong bg-surface-raised px-3 py-2 text-sm placeholder:text-muted"
                />
                {error && (
                  <p className="flex items-start gap-2 text-xs text-danger">
                    <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                    {error}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={sending}
                  className="w-full rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {sending ? t("report.sending") : t("report.send")}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
