"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Link2, Play, Loader2, AlertTriangle } from "lucide-react";
import { extractYoutubeVideoId } from "@/lib/youtube/parseUrl";
import { useT } from "@/i18n/LanguageProvider";

export function YoutubeUrlAnalyzeForm() {
  const router = useRouter();
  const { t } = useT();
  const [value, setValue] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const youtubeVideoId = extractYoutubeVideoId(value);
    if (!youtubeVideoId) {
      setError(t("ytUrl.invalidLink"));
      return;
    }
    setError(null);
    setPending(true);
    try {
      const res = await fetch(`/api/videos/youtube/${youtubeVideoId}/analyze`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? t("analyzeBtn.startFailed"));
        setPending(false);
        return;
      }
      router.push(`/content/${data.videoId}`);
    } catch {
      setError(t("analyzeBtn.networkError"));
      setPending(false);
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-6">
      <div className="mb-3 flex items-center gap-2">
        <Link2 size={16} className="text-accent" />
        <h2 className="text-sm font-semibold">{t("ytUrl.title")}</h2>
      </div>
      <p className="mb-4 text-xs text-muted">{t("ytUrl.subtitle")}</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !pending && submit()}
          placeholder={t("ytUrl.placeholder")}
          disabled={pending}
          className="min-w-0 flex-1 rounded-lg border border-border-strong bg-surface-raised px-3 py-2 text-sm disabled:opacity-50"
        />
        <button
          onClick={submit}
          disabled={pending || !value.trim()}
          className="flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-accent/60 bg-accent/15 px-4 py-2 text-sm font-semibold text-accent hover:bg-accent/25 disabled:opacity-50"
        >
          {pending ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
          {pending ? t("analyzeBtn.starting") : t("analyzeBtn.defaultLabel")}
        </button>
      </div>
      {error && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-danger">
          <AlertTriangle size={12} className="shrink-0" /> {error}
        </p>
      )}
    </div>
  );
}
