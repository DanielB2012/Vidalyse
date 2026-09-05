"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { useT } from "@/i18n/LanguageProvider";

export function VideoPlayer({
  videoId,
  hasThumbnail,
  className = "w-full rounded-2xl border border-border bg-black",
  onReady,
}: {
  videoId: string;
  hasThumbnail: boolean;
  className?: string;
  /** Hands the underlying <video> element to the parent so the timeline /
   *  transcript can seek it. Called once on mount. */
  onReady?: (el: HTMLVideoElement | null) => void;
}) {
  const { t } = useT();
  const [error, setError] = useState(false);
  const src = `/api/videos/${videoId}/stream`;

  if (error) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-border bg-surface p-4 text-sm text-muted">
        <AlertTriangle size={16} className="shrink-0 text-warning" />
        <span>
          {t("player.unsupported1")}
          <a href={src} download className="text-accent hover:underline">
            {t("player.unsupportedLink")}
          </a>
          {t("player.unsupported2")}
        </span>
      </div>
    );
  }

  return (
    <video
      ref={onReady}
      src={src}
      poster={hasThumbnail ? `/api/videos/${videoId}/thumbnail` : undefined}
      controls
      preload="metadata"
      className={className}
      onError={() => setError(true)}
    />
  );
}
