"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown, Play } from "lucide-react";
import clsx from "clsx";
import { useSeek } from "./seek-context";
import { useT } from "@/i18n/LanguageProvider";
import type { InsightBasis } from "@/lib/analysis/types";

export function msToClock(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

export function Card({
  title,
  subtitle,
  right,
  children,
  className,
}: {
  title?: string;
  subtitle?: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={clsx("rounded-2xl border border-border bg-surface p-5", className)}>
      {(title || right) && (
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            {title && <h3 className="text-sm font-semibold">{title}</h3>}
            {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
          </div>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export function Accordion({
  title,
  defaultOpen = false,
  count,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  count?: number;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-border bg-surface">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm font-medium"
      >
        <span>
          {title}
          {count != null && <span className="ml-2 text-xs text-muted">({count})</span>}
        </span>
        <ChevronDown size={16} className={clsx("shrink-0 text-muted transition-transform", open && "rotate-180")} />
      </button>
      {open && <div className="border-t border-border px-4 py-3">{children}</div>}
    </div>
  );
}

export function TimestampButton({ ms, label }: { ms: number; label?: string }) {
  const { seekTo } = useSeek();
  const { t } = useT();
  const text = label ?? msToClock(ms);
  if (!seekTo) {
    return <span className="font-mono text-xs text-muted">{text}</span>;
  }
  return (
    <button
      onClick={() => seekTo(ms)}
      className="inline-flex items-center gap-1 rounded-md border border-border-strong bg-surface-raised px-1.5 py-0.5 font-mono text-xs text-accent transition hover:border-accent/60"
      title={t("analysis.seekTooltip")}
    >
      <Play size={10} />
      {text}
    </button>
  );
}

export function Meter({ value, max = 100, tone = "accent" }: { value: number; max?: number; tone?: "accent" | "success" | "warning" | "danger" }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const bg = tone === "success" ? "bg-success" : tone === "warning" ? "bg-warning" : tone === "danger" ? "bg-danger" : "bg-accent";
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-raised">
      <div className={clsx("h-full rounded-full transition-all", bg)} style={{ width: `${pct}%` }} />
    </div>
  );
}

const BASIS_STYLE: Record<InsightBasis, string> = {
  fait: "border-success/40 text-success",
  donnee: "border-accent-2/40 text-accent-2",
  interpretation: "border-warning/40 text-warning",
  hypothese: "border-muted/40 text-muted",
};
const BASIS_KEY: Record<InsightBasis, string> = {
  fait: "analysis.basisFait",
  donnee: "analysis.basisDonnee",
  interpretation: "analysis.basisInterpretation",
  hypothese: "analysis.basisHypothese",
};

export function BasisTag({ basis }: { basis: InsightBasis }) {
  const { t } = useT();
  return (
    <span className={clsx("rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wide", BASIS_STYLE[basis])}>
      {t(BASIS_KEY[basis])}
    </span>
  );
}

export function EmptyNote({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-border-strong bg-surface/50 p-4 text-sm text-muted">
      {children}
    </p>
  );
}

export function Chip({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "accent" | "success" | "warning" | "danger" }) {
  const cls =
    tone === "accent"
      ? "border-accent/40 text-accent"
      : tone === "success"
        ? "border-success/40 text-success"
        : tone === "warning"
          ? "border-warning/40 text-warning"
          : tone === "danger"
            ? "border-danger/40 text-danger"
            : "border-border-strong text-muted";
  return <span className={clsx("rounded-full border px-2 py-0.5 text-[11px]", cls)}>{children}</span>;
}
