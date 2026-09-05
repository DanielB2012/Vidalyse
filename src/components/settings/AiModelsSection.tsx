"use client";

import { useState, type ReactNode } from "react";
import { HardDrive } from "lucide-react";
import { ModelPicker } from "./ModelPicker";
import { PackTierSelector } from "./PackTierSelector";
import { LocalModelControl } from "./LocalModelControl";
import { CloudApiKeyField } from "./CloudApiKeyField";
import { useT } from "@/i18n/LanguageProvider";
import type { AICategory, ModelEntry, ModelTier } from "@/lib/ai/providers/types";

// Slide-in wrapper: the Cloud API-key field only appears once an online model
// is chosen. Uses the grid-rows 0fr→1fr trick so height animates smoothly.
function Reveal({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <div
      aria-hidden={!open}
      className={`grid transition-all duration-500 ease-out ${
        open
          ? "mt-4 grid-rows-[1fr] opacity-100"
          : "grid-rows-[0fr] opacity-0 pointer-events-none"
      }`}
    >
      <div className="overflow-hidden">{children}</div>
    </div>
  );
}

interface PackModelInfo {
  providerId: string;
  category: AICategory;
  categoryLabel: string;
  label: string;
  diskGB?: number;
  ready: boolean;
  reason?: string;
}

interface PackTierInfo {
  tier: ModelTier;
  models: PackModelInfo[];
}

interface Props {
  categories: AICategory[];
  preferences: { category: AICategory; providerId: string }[];
  catalog: ModelEntry[];
  localPackCategories: AICategory[];
  cloudPackCategories: AICategory[];
  localPackTiers: PackTierInfo[];
  cloudPackTiers: PackTierInfo[];
  currentLocalPackTier: ModelTier | null;
  currentCloudPackTier: ModelTier | null;
  recommendedLocalTier: ModelTier | null;
  systemRamGB: number;
  ollamaReachable: boolean;
  localCatalog: (ModelEntry & { local: NonNullable<ModelEntry["local"]>; installed: boolean })[];
  geminiKeyConfigured: boolean;
  geminiKeyFromEnv: boolean;
}

export function AiModelsSection({
  categories,
  preferences,
  catalog,
  localPackCategories,
  cloudPackCategories,
  localPackTiers,
  cloudPackTiers,
  currentLocalPackTier,
  currentCloudPackTier,
  recommendedLocalTier,
  systemRamGB,
  ollamaReachable,
  localCatalog,
  geminiKeyConfigured,
  geminiKeyFromEnv,
}: Props) {
  const { t } = useT();
  const catLabel = (c: AICategory) => t(`category.${c}`);
  const [tab, setTab] = useState<"simple" | "advanced">("simple");
  const packedCategories = new Set([...localPackCategories, ...cloudPackCategories]);
  const otherCategories = categories.filter((c) => !packedCategories.has(c));

  // The Cloud API-key field shows only when an online (Gemini) model is in play:
  // a key already exists, a saved preference points at Gemini, or the user just
  // picked an online model/pack in this session.
  const cloudKeyPinned = geminiKeyConfigured || geminiKeyFromEnv;
  const hasGeminiPreference =
    currentCloudPackTier !== null ||
    preferences.some((p) => catalog.find((c) => c.id === p.providerId)?.runtime === "gemini");
  const [cloudChosen, setCloudChosen] = useState(false);
  const showCloudKey = cloudKeyPinned || hasGeminiPreference || cloudChosen;

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted">{t("models.heading")}</h2>
        <div className="flex rounded-lg border border-border-strong p-0.5 text-xs">
          <button
            onClick={() => setTab("simple")}
            className={`rounded-md px-3 py-1 ${tab === "simple" ? "bg-accent/15 text-accent" : "text-muted"}`}
          >
            {t("models.simple")}
          </button>
          <button
            onClick={() => setTab("advanced")}
            className={`rounded-md px-3 py-1 ${tab === "advanced" ? "bg-accent/15 text-accent" : "text-muted"}`}
          >
            {t("models.advanced")}
          </button>
        </div>
      </div>

      {tab === "simple" ? (
        <div className="space-y-4">
          <div className="rounded-2xl border border-border bg-surface p-5">
            <p className="text-sm font-medium">{t("models.localPackTitle")}</p>
            <p className="mt-1 text-xs text-muted">
              {t("models.localPackDesc", {
                categories: localPackCategories.map(catLabel).join(", "),
              })}
              {!ollamaReachable && t("models.ollamaMissingNote")}
              {t("models.ramNote", { ram: systemRamGB })}
            </p>
            <div className="mt-3">
              <PackTierSelector
                mode="LOCAL"
                tiers={localPackTiers}
                currentTier={currentLocalPackTier}
                recommendedTier={recommendedLocalTier}
                onActivate={() => setCloudChosen(false)}
              />
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-surface p-5">
            <p className="text-sm font-medium">{t("models.cloudPackTitle")}</p>
            <p className="mt-1 text-xs text-muted">
              {t("models.cloudPackDesc", {
                categories: cloudPackCategories.map(catLabel).join(", "),
              })}
            </p>
            <div className="mt-3">
              <PackTierSelector
                mode="CLOUD"
                tiers={cloudPackTiers}
                currentTier={currentCloudPackTier}
                onActivate={() => setCloudChosen(true)}
              />
            </div>
            <Reveal open={showCloudKey}>
              <CloudApiKeyField configured={geminiKeyConfigured} fromEnv={geminiKeyFromEnv} />
            </Reveal>
          </div>

          {otherCategories.length > 0 && (
            <div className="rounded-2xl border border-dashed border-border-strong bg-surface/50 p-5 text-xs text-muted">
              {t("models.otherCategoriesNote", {
                categories: otherCategories.map(catLabel).join(", "),
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          <div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {categories.map((category) => {
                const pref = preferences.find((p) => p.category === category);
                const options = catalog.filter((m) => m.category === category);
                return (
                  <ModelPicker
                    key={category}
                    category={category}
                    currentProviderId={pref?.providerId ?? options[0]?.id}
                    options={options}
                    onSelectModel={(m) => setCloudChosen(m.runtime === "gemini")}
                  />
                );
              })}
            </div>

            <Reveal open={showCloudKey}>
              <div className="rounded-2xl border border-border bg-surface p-5">
                <p className="text-sm font-medium">{t("models.onlineHeading")}</p>
                <p className="mt-1 text-xs text-muted">{t("models.onlineNote")}</p>
                <div className="mt-4">
                  <CloudApiKeyField configured={geminiKeyConfigured} fromEnv={geminiKeyFromEnv} />
                </div>
              </div>
            </Reveal>
          </div>

          <div>
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-muted">
              <HardDrive size={14} /> {t("models.localAvailable")}
            </h3>
            <div className="overflow-hidden rounded-2xl border border-border">
              <table className="w-full text-sm">
                <thead className="bg-surface-raised text-xs text-muted">
                  <tr>
                    <th className="px-4 py-2 text-left">{t("models.thModel")}</th>
                    <th className="px-4 py-2 text-left">{t("models.thCategory")}</th>
                    <th className="px-4 py-2 text-left">{t("models.thDisk")}</th>
                    <th className="px-4 py-2 text-left">{t("models.thRam")}</th>
                    <th className="px-4 py-2 text-left">{t("models.thVram")}</th>
                    <th className="px-4 py-2 text-right">{t("models.thAction")}</th>
                  </tr>
                </thead>
                <tbody>
                  {localCatalog.map((m) => (
                    <tr key={m.id} className="border-t border-border">
                      <td className="px-4 py-2">{m.label}</td>
                      <td className="px-4 py-2 text-muted">{catLabel(m.category)}</td>
                      <td className="px-4 py-2 text-muted">{m.local.diskGB} {t("common.gb")}</td>
                      <td className="px-4 py-2 text-muted">{m.local.ramGB} {t("common.gb")}</td>
                      <td className="px-4 py-2 text-muted">{m.local.vramGB} {t("common.gb")}</td>
                      <td className="px-4 py-2 text-right">
                        {m.runtime === "ollama-text" ||
                        m.runtime === "ollama-vision" ||
                        m.runtime === "whisper-local" ? (
                          <LocalModelControl
                            providerId={m.id}
                            label={m.label}
                            diskGB={m.local.diskGB}
                            installed={m.installed}
                          />
                        ) : (
                          <button
                            disabled
                            title={t("models.notWired")}
                            className="cursor-not-allowed rounded-lg border border-border-strong px-3 py-1 text-xs text-muted opacity-60"
                          >
                            {t("common.install")}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-muted">{t("models.localFootnote")}</p>
          </div>
        </div>
      )}
    </section>
  );
}
