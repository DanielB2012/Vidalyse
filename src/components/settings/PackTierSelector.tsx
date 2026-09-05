"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, CircleDashed, Loader2, AlertTriangle, Sparkle, Download, Trash2 } from "lucide-react";
import { setPackTier } from "@/app/(app)/settings/actions";
import {
  installLocalModel,
  uninstallLocalModel,
  INSTALL_STAGE_LABEL,
  estimateRemaining,
  formatElapsed,
  type InstallProgress,
} from "./installStream";
import { ConfirmModal } from "./ConfirmModal";
import { InstallProgressPanel, type InstallItemState } from "./InstallProgressPanel";
import { useT } from "@/i18n/LanguageProvider";
import type { ModelTier, ProviderMode } from "@/lib/ai/providers/types";

interface PackModelInfo {
  providerId: string;
  category: string;
  categoryLabel: string;
  label: string;
  diskGB?: number;
  ready: boolean; // installed (LOCAL) or configured/available (CLOUD)
  reason?: string; // why not ready — only relevant for CLOUD (missing API key)
}

const TIER_LABEL: Record<ModelTier, string> = { LIGHT: "Light", MEDIUM: "Medium", PRO: "Pro" };
const TIER_HINT_KEY: Record<ModelTier, string> = {
  LIGHT: "pack.hintLight",
  MEDIUM: "pack.hintMedium",
  PRO: "pack.hintPro",
};

export function PackTierSelector({
  mode,
  tiers,
  currentTier,
  recommendedTier,
  onActivate,
}: {
  mode: ProviderMode;
  tiers: { tier: ModelTier; models: PackModelInfo[] }[];
  currentTier: ModelTier | null;
  recommendedTier?: ModelTier | null;
  /** Fired whenever a tier of this pack is picked (used to reveal the Cloud API-key field). */
  onActivate?: () => void;
}) {
  const router = useRouter();
  const { t } = useT();
  const [pending, startTransition] = useTransition();
  const [confirmTier, setConfirmTier] = useState<ModelTier | null>(null);
  const [confirmUninstallTier, setConfirmUninstallTier] = useState<ModelTier | null>(null);
  const [installing, setInstalling] = useState<ModelTier | null>(null);
  const [uninstalling, setUninstalling] = useState<ModelTier | null>(null);
  const [items, setItems] = useState<InstallItemState[]>([]);
  const [error, setError] = useState<string | null>(null);

  const busy = pending || Boolean(installing) || Boolean(uninstalling);

  function applyTier(tier: ModelTier) {
    onActivate?.();
    startTransition(() => setPackTier(mode, tier));
  }

  // Clicking anywhere on a tier card selects it (no separate "choose" button).
  function choose(tier: ModelTier) {
    if (busy || tier === currentTier) return;
    applyTier(tier);
  }

  // Scans (server-side, via each model's `ready` flag) what's already there for
  // this pack and installs only what's missing. Works even if the tier is
  // already the active one.
  function installMissing(tier: ModelTier) {
    if (busy) return;
    setError(null);
    setConfirmTier(tier);
  }

  function askUninstall(tier: ModelTier) {
    if (busy) return;
    setError(null);
    setConfirmUninstallTier(tier);
  }

  async function confirmUninstall() {
    if (!confirmUninstallTier) return;
    const tier = confirmUninstallTier;
    const installed = tiers.find((t) => t.tier === tier)!.models.filter((m) => m.ready);
    setConfirmUninstallTier(null);
    setUninstalling(tier);
    try {
      for (const model of installed) {
        await uninstallLocalModel(model.providerId);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("pack.uninstallFailed"));
    } finally {
      setUninstalling(null);
    }
  }

  async function confirmInstall() {
    if (!confirmTier) return;
    const tier = confirmTier;
    const models = tiers.find((t) => t.tier === tier)!.models;
    const missing = models.filter((m) => !m.ready);

    setConfirmTier(null);
    setInstalling(tier);
    setItems(
      missing.map((m, i) => ({
        key: m.providerId,
        label: m.categoryLabel,
        status: i === 0 ? "active" : "pending",
        percent: null,
        stageText: INSTALL_STAGE_LABEL.checking,
        etaText: null,
        elapsedText: null,
      }))
    );

    try {
      for (let i = 0; i < missing.length; i++) {
        const model = missing[i];
        const startedAt = Date.now();
        setItems((current) =>
          current.map((it, idx) => (idx === i ? { ...it, status: "active" } : it))
        );

        await installLocalModel(model.providerId, (p: InstallProgress) => {
          const percent =
            p.stage === "downloading_ollama" || p.stage === "pulling_model" ? p.percent : null;
          const stageText = p.stage === "pulling_model" ? INSTALL_STAGE_LABEL.pulling_model : INSTALL_STAGE_LABEL[p.stage];
          setItems((current) =>
            current.map((it, idx) =>
              idx === i
                ? {
                    ...it,
                    status: "active",
                    percent,
                    stageText,
                    etaText: estimateRemaining(startedAt, percent, t),
                    elapsedText: formatElapsed(startedAt, t),
                  }
                : it
            )
          );
        });

        setItems((current) =>
          current.map((it, idx) => (idx === i ? { ...it, status: "done", percent: 100 } : it))
        );
      }
      applyTier(tier);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("pack.installFailed"));
      setItems((current) => {
        const activeIdx = current.findIndex((it) => it.status === "active");
        return activeIdx === -1
          ? current
          : current.map((it, idx) => (idx === activeIdx ? { ...it, status: "error" } : it));
      });
    } finally {
      setInstalling(null);
    }
  }

  const confirmModels = confirmTier ? tiers.find((t) => t.tier === confirmTier)!.models.filter((m) => !m.ready) : [];
  const confirmUninstallModels = confirmUninstallTier
    ? tiers.find((t) => t.tier === confirmUninstallTier)!.models.filter((m) => m.ready)
    : [];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {tiers.map(({ tier, models }) => {
          const readyCount = models.filter((m) => m.ready).length;
          const missingCount = models.length - readyCount;
          const allReady = missingCount === 0;
          const selected = tier === currentTier;
          const isInstalling = installing === tier;
          const isUninstalling = uninstalling === tier;

          return (
            <div
              key={tier}
              role="button"
              tabIndex={0}
              aria-pressed={selected}
              onClick={() => choose(tier)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  choose(tier);
                }
              }}
              className={`flex flex-col rounded-xl border p-4 text-left transition ${
                selected
                  ? "border-accent bg-accent/10"
                  : "border-border bg-surface hover:border-accent/50"
              } ${busy || selected ? "cursor-default" : "cursor-pointer"} ${
                busy ? "pointer-events-none opacity-70" : ""
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">{TIER_LABEL[tier]}</span>
                {isInstalling || isUninstalling ? (
                  <Loader2 size={14} className="animate-spin text-muted" />
                ) : allReady ? (
                  <span className="flex items-center gap-1 text-xs text-success">
                    <CheckCircle2 size={12} /> {t(mode === "LOCAL" ? "pack.installed" : "pack.configured")}
                  </span>
                ) : readyCount > 0 ? (
                  <span className="flex items-center gap-1 text-xs text-warning">
                    <CircleDashed size={12} />{" "}
                    {t("pack.partial", { ready: readyCount, total: models.length })}
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-xs text-muted">
                    <CircleDashed size={12} />{" "}
                    {t(mode === "LOCAL" ? "pack.notInstalled" : "pack.notConfigured")}
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-muted">{t(TIER_HINT_KEY[tier])}</p>
              {tier === recommendedTier && (
                <p className="mt-1 flex items-center gap-1 text-[11px] font-medium text-accent">
                  <Sparkle size={11} /> {t("pack.recommended")}
                </p>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-2">
                {selected ? (
                  <span className="text-[11px] font-medium text-accent">{t("pack.active")}</span>
                ) : (
                  <span className="text-[11px] text-muted">{t("pack.clickToActivate")}</span>
                )}

                {mode === "LOCAL" && !allReady && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      installMissing(tier);
                    }}
                    disabled={busy}
                    className="flex items-center gap-1.5 rounded-lg border border-accent/60 bg-accent/10 px-3 py-1.5 text-xs font-semibold text-accent hover:bg-accent/20 disabled:opacity-50"
                  >
                    {isInstalling ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                    {t(missingCount > 1 ? "pack.installMissingPlural" : "pack.installMissing", {
                      count: missingCount,
                    })}
                  </button>
                )}

                {mode === "LOCAL" && readyCount > 0 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      askUninstall(tier);
                    }}
                    disabled={busy}
                    className="flex items-center gap-1.5 rounded-lg border border-border-strong px-3 py-1.5 text-xs text-muted hover:border-danger/60 hover:text-danger disabled:opacity-50"
                  >
                    {isUninstalling ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                    {readyCount < models.length
                      ? t("pack.uninstallCount", { count: readyCount })
                      : t("common.uninstall")}
                  </button>
                )}

                {mode === "CLOUD" && !allReady && (
                  <span className="text-[11px] text-muted">{t("pack.keyBelow")}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {installing && items.length > 0 && <InstallProgressPanel items={items} />}

      {error && (
        <p className="flex items-center gap-1.5 text-xs text-danger">
          <AlertTriangle size={12} className="shrink-0" /> {error}
        </p>
      )}

      <ConfirmModal
        open={confirmTier !== null}
        title={t(
          confirmModels.length > 1 ? "pack.confirmInstallTitlePlural" : "pack.confirmInstallTitle",
          { tier: confirmTier ? TIER_LABEL[confirmTier] : "", count: confirmModels.length }
        )}
        description={t("pack.confirmInstallDesc")}
        items={confirmModels.map((m) => ({
          label: `${m.categoryLabel} — ${m.label}`,
          meta: m.diskGB ? `~${m.diskGB} ${t("common.gb")}` : undefined,
        }))}
        confirmLabel={t("common.install")}
        onConfirm={confirmInstall}
        onCancel={() => setConfirmTier(null)}
      />

      <ConfirmModal
        open={confirmUninstallTier !== null}
        title={t("pack.confirmUninstallTitle", {
          tier: confirmUninstallTier ? TIER_LABEL[confirmUninstallTier] : "",
        })}
        description={t("pack.confirmUninstallDesc")}
        items={confirmUninstallModels.map((m) => ({
          label: `${m.categoryLabel} — ${m.label}`,
          meta: m.diskGB ? `~${m.diskGB} ${t("common.gb")}` : undefined,
        }))}
        confirmLabel={t("common.uninstall")}
        onConfirm={confirmUninstall}
        onCancel={() => setConfirmUninstallTier(null)}
      />
    </div>
  );
}
