"use client";

import { useState, useTransition } from "react";
import { Link2, X } from "lucide-react";
import { linkYoutubeVideo, unlinkYoutubeVideo } from "@/app/(app)/content/[videoId]/actions";
import { useT } from "@/i18n/LanguageProvider";

export function LinkYoutubeVideoForm({ videoId, linked }: { videoId: string; linked: boolean }) {
  const { t } = useT();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      try {
        await linkYoutubeVideo(videoId, value);
        setValue("");
      } catch (err) {
        setError(err instanceof Error ? err.message : t("linkYt.unknownError"));
      }
    });
  }

  function unlink() {
    setError(null);
    startTransition(async () => {
      try {
        await unlinkYoutubeVideo(videoId);
      } catch (err) {
        setError(err instanceof Error ? err.message : t("linkYt.unknownError"));
      }
    });
  }

  if (linked) {
    return (
      <button
        onClick={unlink}
        disabled={pending}
        className="flex items-center gap-1.5 text-xs text-muted hover:text-danger disabled:opacity-50"
      >
        <X size={12} />
        {t("linkYt.unlink")}
      </button>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder={t("linkYt.placeholder")}
          className="min-w-0 flex-1 rounded-lg border border-border-strong bg-surface-raised px-3 py-1.5 text-xs"
        />
        <button
          onClick={submit}
          disabled={pending || !value.trim()}
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-accent/60 bg-accent/10 px-3 py-1.5 text-xs text-accent hover:bg-accent/20 disabled:opacity-50"
        >
          <Link2 size={12} />
          {t("linkYt.link")}
        </button>
      </div>
      {error && <p className="text-[11px] text-danger">{error}</p>}
    </div>
  );
}
