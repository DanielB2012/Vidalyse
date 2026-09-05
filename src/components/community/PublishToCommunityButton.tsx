"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Users, Check, X, Loader2 } from "lucide-react";
import { publishVideoAction, unpublishVideoAction } from "@/app/(app)/community/actions";
import { useT } from "@/i18n/LanguageProvider";

interface Props {
  videoId: string;
  initialPublicId: string | null;
  canPublish: boolean;
  profileHandle: string | null;
  profilePublic: boolean;
}

export function PublishToCommunityButton({
  videoId,
  initialPublicId,
  canPublish,
  profileHandle,
  profilePublic,
}: Props) {
  const { t } = useT();
  const [publicId, setPublicId] = useState<string | null>(initialPublicId);
  const [open, setOpen] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function publish() {
    setError(null);
    startTransition(async () => {
      const res = await publishVideoAction(videoId);
      if (res.ok) {
        setPublicId(res.publicId);
        setOpen(false);
      } else {
        setError(t(res.error === "no_analysis" ? "community.publishNoAnalysis" : "community.publishNotFound"));
      }
    });
  }

  function unpublish() {
    setError(null);
    startTransition(async () => {
      await unpublishVideoAction(videoId);
      setPublicId(null);
      setConfirmRemove(false);
    });
  }

  if (!canPublish) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-muted">
          <Users size={15} />
          {t("community.publishTitle")}
        </h2>
        <p className="text-sm text-muted">{t("community.publishNeedsAnalysis")}</p>
      </div>
    );
  }

  if (publicId) {
    return (
      <div className="rounded-2xl border border-accent/30 bg-accent/5 p-5">
        <h2 className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-accent">
          <Check size={15} />
          {t("community.publishedTitle")}
        </h2>
        <p className="text-sm text-muted">
          {profilePublic
            ? t("community.publishedPublic")
            : t("community.publishedProfilePrivate")}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {profileHandle && (
            <Link
              href={`/community/profile/${profileHandle}`}
              className="text-xs font-medium text-accent hover:underline"
            >
              {t("community.viewOnProfile")}
            </Link>
          )}
          {!confirmRemove ? (
            <button
              onClick={() => setConfirmRemove(true)}
              disabled={pending}
              className="text-xs text-muted hover:text-danger disabled:opacity-50"
            >
              {t("community.remove")}
            </button>
          ) : (
            <span className="flex items-center gap-2 text-xs">
              {t("community.removeConfirm")}
              <button
                onClick={unpublish}
                disabled={pending}
                className="font-medium text-danger hover:underline disabled:opacity-50"
              >
                {pending ? <Loader2 size={12} className="animate-spin" /> : t("community.removeYes")}
              </button>
              <button onClick={() => setConfirmRemove(false)} className="text-muted hover:text-foreground">
                {t("community.cancel")}
              </button>
            </span>
          )}
        </div>
        {error && <p className="mt-2 text-[11px] text-danger">{error}</p>}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <h2 className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-muted">
        <Users size={15} />
        {t("community.publishTitle")}
      </h2>
      <p className="text-sm text-muted">{t("community.publishIntro")}</p>

      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="mt-3 flex items-center gap-1.5 rounded-lg border border-accent/60 bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/20"
        >
          <Users size={12} />
          {t("community.publishCta")}
        </button>
      ) : (
        <div className="mt-3 rounded-xl border border-border-strong bg-surface-raised p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            {t("community.publishWhatVisible")}
          </p>
          <ul className="mt-2 space-y-1 text-sm text-muted">
            <li>· {t("community.visibleTitle")}</li>
            <li>· {t("community.visibleSummary")}</li>
            <li>· {t("community.visibleThumbnail")}</li>
            <li>· {t("community.visibleStrengths")}</li>
            <li>· {t("community.visibleStructure")}</li>
          </ul>
          <p className="mt-2 text-[11px] text-muted">{t("community.publishPrivacyNote")}</p>
          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={publish}
              disabled={pending}
              className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
            >
              {pending ? <Loader2 size={12} className="animate-spin" /> : <Users size={12} />}
              {t("community.publishConfirm")}
            </button>
            <button
              onClick={() => setOpen(false)}
              disabled={pending}
              className="flex items-center gap-1.5 rounded-lg border border-border-strong px-3 py-1.5 text-xs text-muted hover:text-foreground disabled:opacity-50"
            >
              <X size={12} />
              {t("community.cancel")}
            </button>
          </div>
        </div>
      )}
      {error && <p className="mt-2 text-[11px] text-danger">{error}</p>}
    </div>
  );
}
