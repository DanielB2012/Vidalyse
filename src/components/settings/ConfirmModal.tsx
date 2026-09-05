"use client";

import { useT } from "@/i18n/LanguageProvider";

export function ConfirmModal({
  open,
  title,
  description,
  items,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description?: string;
  items?: { label: string; meta?: string }[];
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useT();
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-border bg-surface p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-sm font-semibold">{title}</p>
        {description && <p className="mt-1 text-xs text-muted">{description}</p>}
        {items && items.length > 0 && (
          <ul className="mt-3 space-y-1 rounded-lg border border-border bg-surface-raised p-2.5 text-xs text-muted">
            {items.map((it, i) => (
              <li key={i} className="flex items-center justify-between gap-2">
                <span>{it.label}</span>
                {it.meta && <span className="shrink-0">{it.meta}</span>}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-lg border border-border-strong px-3 py-1.5 text-xs hover:border-danger/40"
          >
            {cancelLabel ?? t("common.cancel")}
          </button>
          <button
            onClick={onConfirm}
            className="rounded-lg border border-accent/60 bg-accent/10 px-3 py-1.5 text-xs text-accent hover:bg-accent/20"
          >
            {confirmLabel ?? t("common.confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
