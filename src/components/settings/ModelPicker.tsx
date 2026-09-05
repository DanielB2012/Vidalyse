"use client";

import { useState, useTransition } from "react";
import { AlertTriangle } from "lucide-react";
import { setModelPreference } from "@/app/(app)/settings/actions";
import { useT } from "@/i18n/LanguageProvider";
import type { AICategory, ModelEntry } from "@/lib/ai/providers/types";

export function ModelPicker({
  category,
  currentProviderId,
  options,
  onSelectModel,
}: {
  category: AICategory;
  currentProviderId: string;
  options: ModelEntry[];
  /** Fired with the newly picked model — lets the parent reveal the Cloud API-key field. */
  onSelectModel?: (model: ModelEntry) => void;
}) {
  const { t } = useT();
  const [selected, setSelected] = useState(currentProviderId);
  const [pending, startTransition] = useTransition();
  const current = options.find((o) => o.id === selected);

  const cloudOptions = options.filter((o) => o.mode === "CLOUD");
  const localOptions = options.filter((o) => o.mode === "LOCAL");

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <p className="text-sm font-medium">{t(`category.${category}`)}</p>

      <select
        value={selected}
        disabled={pending}
        onChange={(e) => {
          setSelected(e.target.value);
          const picked = options.find((o) => o.id === e.target.value);
          if (picked) onSelectModel?.(picked);
          startTransition(() => setModelPreference(category, e.target.value));
        }}
        className="mt-2 w-full rounded-lg border border-border-strong bg-surface-raised px-3 py-2 text-sm"
      >
        <optgroup label={t("modelPicker.cloudGroup")}>
          {cloudOptions.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label} ({o.tier})
            </option>
          ))}
        </optgroup>
        <optgroup label={t("modelPicker.localGroup")}>
          {localOptions.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label} ({o.tier})
            </option>
          ))}
        </optgroup>
      </select>

      {current && (
        <div className="mt-2 space-y-1">
          <p className="text-xs text-muted">{t(current.description)}</p>
          {current.availability.status !== "available" && (
            <p className="flex items-start gap-1.5 text-xs text-warning">
              <AlertTriangle size={12} className="mt-0.5 shrink-0" />
              {t(current.availability.reason)}
            </p>
          )}
          {current.tier === "LIGHT" && (
            <p className="text-xs text-muted">{t("models.lightWarning")}</p>
          )}
        </div>
      )}
    </div>
  );
}
