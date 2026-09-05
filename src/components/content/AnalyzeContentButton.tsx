"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Play, Loader2, AlertTriangle } from "lucide-react";
import { useT } from "@/i18n/LanguageProvider";

export function AnalyzeContentButton({
  videoId,
  youtubeVideoId,
  title,
  label,
  size = "md",
}: {
  /** Local Video.id — used when the source file is already imported. */
  videoId?: string;
  /** YouTube video id — analyse straight from YouTube (pipeline downloads it). */
  youtubeVideoId?: string;
  /** Title to seed the Video row with, when analysing from YouTube. */
  title?: string;
  label?: string;
  size?: "md" | "lg";
}) {
  const router = useRouter();
  const { t } = useT();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const resolvedLabel = label ?? t("analyzeBtn.defaultLabel");

  async function start(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setPending(true);
    setError(null);
    try {
      const url = youtubeVideoId
        ? `/api/videos/youtube/${youtubeVideoId}/analyze`
        : `/api/videos/${videoId}/analyze`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(youtubeVideoId ? { title } : {}),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? t("analyzeBtn.startFailed"));
        setPending(false);
        return;
      }
      router.push(`/content/${data.videoId ?? videoId}`);
    } catch {
      setError(t("analyzeBtn.networkError"));
      setPending(false);
    }
  }

  if (error) {
    return (
      <p className="flex items-center gap-1.5 text-xs text-danger">
        <AlertTriangle size={12} className="shrink-0" /> {error}
      </p>
    );
  }

  const lg = size === "lg";
  const iconSize = lg ? 18 : 14;

  return (
    <button
      onClick={start}
      disabled={pending}
      className={
        lg
          ? "flex w-full items-center justify-center gap-2 rounded-xl border border-accent/60 bg-accent/15 px-5 py-3 text-sm font-semibold text-accent hover:bg-accent/25 disabled:opacity-50"
          : "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-accent/60 bg-accent/15 px-3 py-1.5 text-xs font-semibold text-accent hover:bg-accent/25 disabled:opacity-50"
      }
    >
      {pending ? (
        <Loader2 size={iconSize} className="shrink-0 animate-spin" />
      ) : (
        <Play size={iconSize} className="shrink-0" />
      )}
      {pending ? t("analyzeBtn.starting") : resolvedLabel}
    </button>
  );
}
