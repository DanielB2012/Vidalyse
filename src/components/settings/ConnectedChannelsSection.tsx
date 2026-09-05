"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PlusCircle, CheckCircle2, Loader2, X } from "lucide-react";
import { useT } from "@/i18n/LanguageProvider";

export interface ConnectedYoutubeChannel {
  id: string;
  active: boolean;
  youtubeChannelId: string;
  title: string;
  handle: string | null;
  thumbnailUrl: string | null;
}

export function ConnectedChannelsSection({ channels }: { channels: ConnectedYoutubeChannel[] }) {
  const router = useRouter();
  const { t } = useT();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function activate(id: string) {
    setError(null);
    setPendingId(id);
    try {
      const res = await fetch(`/api/youtube-channels/${id}/activate`, { method: "POST" });
      if (!res.ok) {
        setError(t("connectedChannels.activateFailed"));
        return;
      }
      startTransition(() => router.refresh());
    } catch {
      setError(t("connectedChannels.activateFailed"));
    } finally {
      setPendingId(null);
    }
  }

  async function remove(id: string) {
    setError(null);
    setPendingId(id);
    try {
      const res = await fetch(`/api/youtube-channels/${id}`, { method: "DELETE" });
      if (!res.ok) {
        setError(t("connectedChannels.removeFailed"));
        return;
      }
      startTransition(() => router.refresh());
    } catch {
      setError(t("connectedChannels.removeFailed"));
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="space-y-3">
      {channels.length === 0 && (
        <p className="rounded-2xl border border-dashed border-border-strong bg-surface/50 p-5 text-sm text-muted">
          {t("connectedChannels.empty")}
        </p>
      )}

      <div className="space-y-2">
        {channels.map((ch) => (
          <div key={ch.id} className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-4">
            <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-surface-raised">
              {ch.thumbnailUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={ch.thumbnailUrl} alt="" className="h-full w-full object-cover" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{ch.title}</p>
              {ch.handle && <p className="truncate text-xs text-muted">{ch.handle}</p>}
            </div>
            {ch.active ? (
              <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-success/40 bg-success/10 px-2.5 py-1 text-xs font-medium text-success">
                <CheckCircle2 size={13} /> {t("connectedChannels.active")}
              </span>
            ) : (
              <button
                onClick={() => activate(ch.id)}
                disabled={pendingId === ch.id}
                className="shrink-0 rounded-lg border border-accent/60 bg-accent/10 px-3 py-1.5 text-xs font-semibold text-accent hover:bg-accent/20 disabled:opacity-50"
              >
                {pendingId === ch.id ? <Loader2 size={13} className="animate-spin" /> : t("connectedChannels.activate")}
              </button>
            )}
            <button
              onClick={() => remove(ch.id)}
              disabled={pendingId === ch.id}
              aria-label={t("connectedChannels.remove")}
              className="shrink-0 rounded-lg border border-border-strong p-1.5 text-muted hover:border-danger/60 hover:text-danger disabled:opacity-50"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>

      {error && <p className="text-xs text-danger">{error}</p>}

      {/* Full browser navigation to an API route (redirects to Google), not a page — plain <a> is correct here. */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a
        href="/api/youtube-channels/link/start"
        className="flex w-fit items-center gap-2 rounded-lg border border-dashed border-border-strong px-3.5 py-2 text-xs font-medium text-muted transition hover:border-accent/60 hover:text-foreground"
      >
        <PlusCircle size={14} />
        {t("connectedChannels.add")}
      </a>
      <p className="text-[11px] text-muted">{t("connectedChannels.addHint")}</p>
    </div>
  );
}
