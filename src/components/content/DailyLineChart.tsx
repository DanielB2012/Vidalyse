"use client";

import { useMemo, useState } from "react";
import { useT } from "@/i18n/LanguageProvider";

interface Point {
  date: string; // YYYY-MM-DD
  value: number;
}

const WIDTH = 600;
const HEIGHT = 160;
const PAD_LEFT = 40;
const PAD_RIGHT = 12;
const PAD_TOP = 12;
const PAD_BOTTOM = 24;

function niceMax(max: number): number {
  if (max <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(max));
  const normalized = max / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

export function DailyLineChart({ title, data, color }: { title: string; data: Point[]; color: string }) {
  const { t, locale } = useT();
  const bcp47 = locale === "en" ? "en-US" : "fr-FR";
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const formatShort = (n: number): string => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return new Intl.NumberFormat(bcp47).format(Math.round(n));
  };
  const formatDateShort = (iso: string): string =>
    new Intl.DateTimeFormat(bcp47, { day: "numeric", month: "short" }).format(new Date(iso));

  const { path, points, yMax, plotWidth, plotHeight } = useMemo(() => {
    const plotWidth = WIDTH - PAD_LEFT - PAD_RIGHT;
    const plotHeight = HEIGHT - PAD_TOP - PAD_BOTTOM;
    const yMax = niceMax(Math.max(...data.map((d) => d.value), 1));
    const n = data.length;
    const points = data.map((d, i) => {
      const x = PAD_LEFT + (n <= 1 ? plotWidth / 2 : (i / (n - 1)) * plotWidth);
      const y = PAD_TOP + plotHeight - (d.value / yMax) * plotHeight;
      return { x, y, ...d };
    });
    const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
    return { path, points, yMax, plotWidth, plotHeight };
  }, [data]);

  if (data.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface-raised p-4 text-xs text-muted">
        {title} — {t("analytics.dataUnavailable")}
      </div>
    );
  }

  const hovered = hoverIndex !== null ? points[hoverIndex] : null;
  const last = points[points.length - 1];

  function handleMove(e: React.MouseEvent<SVGRectElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * WIDTH;
    let closest = 0;
    let closestDist = Infinity;
    points.forEach((p, i) => {
      const dist = Math.abs(p.x - relX);
      if (dist < closestDist) {
        closestDist = dist;
        closest = i;
      }
    });
    setHoverIndex(closest);
  }

  return (
    <div className="rounded-xl border border-border bg-surface-raised p-4">
      <p className="mb-2 text-xs font-medium text-muted">{title}</p>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full" style={{ overflow: "visible" }}>
        {[0, 0.5, 1].map((f) => {
          const y = PAD_TOP + plotHeight * (1 - f);
          return (
            <g key={f}>
              <line
                x1={PAD_LEFT}
                x2={WIDTH - PAD_RIGHT}
                y1={y}
                y2={y}
                stroke="var(--border)"
                strokeWidth={1}
              />
              <text x={PAD_LEFT - 6} y={y} textAnchor="end" dominantBaseline="middle" fontSize={10} fill="var(--muted)">
                {formatShort(yMax * f)}
              </text>
            </g>
          );
        })}

        <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />

        <circle cx={last.x} cy={last.y} r={4} fill={color} stroke="var(--surface-raised)" strokeWidth={2} />
        <text x={last.x} y={last.y - 10} textAnchor="end" fontSize={11} fontWeight={600} fill="var(--foreground)">
          {formatShort(last.value)}
        </text>

        {hovered && (
          <>
            <line
              x1={hovered.x}
              x2={hovered.x}
              y1={PAD_TOP}
              y2={PAD_TOP + plotHeight}
              stroke="var(--border-strong)"
              strokeWidth={1}
            />
            <circle cx={hovered.x} cy={hovered.y} r={4} fill={color} stroke="var(--surface-raised)" strokeWidth={2} />
          </>
        )}

        <rect
          x={PAD_LEFT}
          y={PAD_TOP}
          width={plotWidth}
          height={plotHeight}
          fill="transparent"
          onMouseMove={handleMove}
          onMouseLeave={() => setHoverIndex(null)}
        />
      </svg>
      <div className="relative">
        {hovered && (
          <div
            className="pointer-events-none absolute -top-2 rounded-lg border border-border-strong bg-surface px-2 py-1 text-[11px] shadow-lg"
            style={{ left: `${(hovered.x / WIDTH) * 100}%`, transform: "translate(-50%, -100%)" }}
          >
            <p className="font-medium">{formatDateShort(hovered.date)}</p>
            <p className="text-muted">{formatShort(hovered.value)}</p>
          </div>
        )}
      </div>
    </div>
  );
}
