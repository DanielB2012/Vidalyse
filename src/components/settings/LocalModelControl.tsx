"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Trash2, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import {
  installLocalModel,
  uninstallLocalModel,
  INSTALL_STAGE_LABEL,
  estimateRemaining,
  formatElapsed,
  type InstallProgress,
} from "./installStream";
import { ConfirmModal } from "./ConfirmModal";
import { useT } from "@/i18n/LanguageProvider";

export function LocalModelControl({
  providerId,
  label,
  diskGB,
  installed,
}: {
  providerId: string;
  label: string;
  diskGB: number;
  installed: boolean;
}) {
  const router = useRouter();
  const { t } = useT();
  const [confirming, setConfirming] = useState(false);
  const [progress, setProgress] = useState<InstallProgress | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const [uninstalling, setUninstalling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runInstall() {
    setConfirming(false);
    setRunning(true);
    setError(null);
    setProgress(null);
    const start = Date.now();
    setStartedAt(start);
    try {
      await installLocalModel(providerId, setProgress);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.unknownError"));
    } finally {
      setRunning(false);
    }
  }

  async function runUninstall() {
    setUninstalling(true);
    setError(null);
    try {
      await uninstallLocalModel(providerId);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.unknownError"));
    } finally {
      setUninstalling(false);
    }
  }

  if (error) {
    return (
      <div className="min-w-[220px] text-right text-xs">
        <div className="flex items-center justify-end gap-1.5 text-danger">
          <AlertTriangle size={12} className="shrink-0" />
          <span>{error}</span>
        </div>
        <button onClick={() => setError(null)} className="mt-1 text-[11px] text-accent hover:underline">
          {t("common.retry")}
        </button>
      </div>
    );
  }

  if (running || progress) {
    if (progress?.stage === "done") {
      return (
        <div className="flex items-center justify-end gap-1.5 text-xs text-success">
          <CheckCircle2 size={12} />
          {t("install.modelReady", { label })}
        </div>
      );
    }
    const percent =
      progress?.stage === "downloading_ollama" || progress?.stage === "pulling_model" ? progress.percent : null;
    const eta = startedAt ? estimateRemaining(startedAt, percent, t) : null;
    const elapsed = startedAt ? formatElapsed(startedAt, t) : null;
    return (
      <div className="flex items-center justify-end gap-1.5 text-xs text-muted">
        <Loader2 size={12} className="animate-spin" />
        {progress ? t(INSTALL_STAGE_LABEL[progress.stage]) : t("install.starting")}
        {percent !== null && ` ${percent}%`}
        {elapsed && ` — ${elapsed}`}
        {eta && ` — ${eta}`}
      </div>
    );
  }

  if (installed) {
    return (
      <div className="flex items-center justify-end gap-2 text-xs">
        <span className="flex items-center gap-1 text-success">
          <CheckCircle2 size={12} /> {t("pack.installed")}
        </span>
        <button
          onClick={runUninstall}
          disabled={uninstalling}
          className="flex items-center gap-1.5 rounded-lg border border-border-strong px-3 py-1 text-muted hover:border-danger/60 hover:text-danger disabled:opacity-50"
        >
          {uninstalling ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
          {t("common.uninstall")}
        </button>
      </div>
    );
  }

  return (
    <>
      <button
        onClick={() => setConfirming(true)}
        className="flex items-center gap-1.5 rounded-lg border border-border-strong px-3 py-1 text-xs hover:border-accent/60"
      >
        <Download size={12} />
        {t("common.install")}
      </button>
      <ConfirmModal
        open={confirming}
        title={t("install.confirmTitle", { label })}
        description={t("install.confirmDesc")}
        items={[{ label, meta: `~${diskGB} ${t("common.gb")}` }]}
        confirmLabel={t("common.install")}
        onConfirm={runInstall}
        onCancel={() => setConfirming(false)}
      />
    </>
  );
}
