"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Users, Check, Heart, Loader2, ChevronDown } from "lucide-react";
import { publishVideoAction, unpublishVideoAction } from "@/app/(app)/community/actions";
import type { PublishableVideo } from "@/lib/community/publish";
import { useT } from "@/i18n/LanguageProvider";

function mmss(sec: number | null): string | null {
  if (sec == null) return null;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function Row({ video, profilePublic }: { video: PublishableVideo; profilePublic: boolean }) {
  const { t } = useT();
  const [published, setPublished] = useState(video.published);
  const [likeCount] = useState(video.likeCount);
  const [expand, setExpand] = useState<"none" | "publish" | "remove">("none");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function publish() {
    setError(null);
    startTransition(async () => {
      const res = await publishVideoAction(video.videoId);
      if (res.ok) {
        setPublished(true);
        setExpand("none");
      } else {
        setError(t(res.error === "no_analysis" ? "community.publishNoAnalysis" : "community.publishNotFound"));
      }
    });
  }

  function unpublish() {
    setError(null);
    startTransition(async () => {
      await unpublishVideoAction(video.videoId);
      setPublished(false);
      setExpand("none");
    });
  }

  const duration = mmss(video.durationSec);

  return (
    <li className="rounded-xl border border-border bg-surface p-3">
      <div className="flex items-center gap-3">
        {video.hasThumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/videos/${video.videoId}/thumbnail`}
            alt=""
            className="h-12 w-20 shrink-0 rounded-lg border border-border object-cover"
          />
        ) : (
          <div className="h-12 w-20 shrink-0 rounded-lg border border-border bg-surface-raised" />
        )}

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{video.title ?? t("community.untitled")}</p>
          <p className="mt-0.5 flex items-center gap-2 text-[11px] text-muted">
            {duration && <span>{duration}</span>}
            {published && (
              <span className="flex items-center gap-1">
                <Heart size={11} />
                {likeCount}
              </span>
            )}
            <Link href={`/content/${video.videoId}`} className="hover:text-foreground hover:underline">
              {t("community.manageOnVideo")}
            </Link>
          </p>
        </div>

        {published ? (
          <div className="flex shrink-0 items-center gap-2">
            <span className="flex items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-medium text-accent">
              <Check size={11} />
              {t("community.publishedShort")}
            </span>
            <button
              onClick={() => setExpand(expand === "remove" ? "none" : "remove")}
              disabled={pending}
              className="text-xs text-muted hover:text-danger disabled:opacity-50"
            >
              {t("community.remove")}
            </button>
          </div>
        ) : (
          <button
            onClick={() => setExpand(expand === "publish" ? "none" : "publish")}
            disabled={pending}
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-accent/60 bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/20 disabled:opacity-50"
          >
            <Users size={12} />
            {t("community.publishCta")}
            <ChevronDown size={12} className={expand === "publish" ? "rotate-180 transition" : "transition"} />
          </button>
        )}
      </div>

      {expand === "publish" && (
        <div className="mt-3 rounded-lg border border-border-strong bg-surface-raised p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
            {t("community.publishWhatVisible")}
          </p>
          <ul className="mt-1.5 space-y-0.5 text-xs text-muted">
            <li>· {t("community.visibleTitle")}</li>
            <li>· {t("community.visibleSummary")}</li>
            <li>· {t("community.visibleThumbnail")}</li>
            <li>· {t("community.visibleStrengths")}</li>
            <li>· {t("community.visibleStructure")}</li>
          </ul>
          <p className="mt-1.5 text-[11px] text-muted">{t("community.publishPrivacyNote")}</p>
          {!profilePublic && (
            <p className="mt-1.5 text-[11px] text-muted">{t("community.publishManagerPrivateHint")}</p>
          )}
          <div className="mt-2 flex items-center gap-2">
            <button
              onClick={publish}
              disabled={pending}
              className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
            >
              {pending ? <Loader2 size={12} className="animate-spin" /> : <Users size={12} />}
              {t("community.publishConfirm")}
            </button>
            <button
              onClick={() => setExpand("none")}
              disabled={pending}
              className="rounded-lg border border-border-strong px-3 py-1.5 text-xs text-muted hover:text-foreground disabled:opacity-50"
            >
              {t("community.cancel")}
            </button>
          </div>
        </div>
      )}

      {expand === "remove" && (
        <div className="mt-3 flex items-center gap-3 rounded-lg border border-border-strong bg-surface-raised p-3 text-xs">
          <span>{t("community.removeConfirm")}</span>
          <button
            onClick={unpublish}
            disabled={pending}
            className="font-medium text-danger hover:underline disabled:opacity-50"
          >
            {pending ? <Loader2 size={12} className="animate-spin" /> : t("community.removeYes")}
          </button>
          <button onClick={() => setExpand("none")} className="text-muted hover:text-foreground">
            {t("community.cancel")}
          </button>
        </div>
      )}

      {error && <p className="mt-2 text-[11px] text-danger">{error}</p>}
    </li>
  );
}

export function CommunityPublishManager({
  videos,
  profilePublic,
}: {
  videos: PublishableVideo[];
  profilePublic: boolean;
}) {
  const { t } = useT();

  if (videos.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border-strong bg-surface/50 p-6 text-sm text-muted">
        {t("community.publishManagerEmpty")}
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {videos.map((v) => (
        <Row key={v.videoId} video={v} profilePublic={profilePublic} />
      ))}
    </ul>
  );
}
