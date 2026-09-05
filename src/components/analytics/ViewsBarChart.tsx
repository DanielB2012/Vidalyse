"use client";

import { useState } from "react";
import { useT } from "@/i18n/LanguageProvider";

interface DailyPoint {
  date: string;
  views: number;
}

// Single-series bar chart, no dual axis (watch time gets its own stat tile
// instead of a second scale on this chart — see dataviz skill: never plot
// two differently-scaled measures on one axis).
export function ViewsBarChart({ data }: { data: DailyPoint[] }) {
  const { t, locale } = useT();
  const [hover, setHover] = useState<number | null>(null);

  if (data.length === 0) {
    return <p className="text-sm text-muted">{t("analytics.dataUnavailable")}</p>;
  }

  const max = Math.max(...data.map((d) => d.views), 1);
  const width = 640;
  const height = 140;
  const barGap = 3;
  const barWidth = width / data.length - barGap;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${width} ${height + 20}`} className="w-full" role="img" aria-label={t("analytics.chartAria")}>
        <line x1={0} y1={height} x2={width} y2={height} stroke="var(--border)" strokeWidth={1} />
        {data.map((d, i) => {
          const barHeight = Math.max((d.views / max) * (height - 8), d.views > 0 ? 2 : 0);
          const x = i * (barWidth + barGap);
          const y = height - barHeight;
          const isHover = hover === i;
          return (
            <g key={d.date}>
              <rect
                x={x}
                y={y}
                width={Math.max(barWidth, 1)}
                height={barHeight}
                rx={2}
                fill={isHover ? "var(--accent-2)" : "var(--accent)"}
                opacity={isHover ? 1 : 0.85}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              />
              <rect
                x={x}
                y={0}
                width={Math.max(barWidth, 1)}
                height={height}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              />
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <div className="pointer-events-none absolute -top-2 left-0 rounded-lg border border-border-strong bg-surface-raised px-2.5 py-1.5 text-xs shadow-lg">
          <span className="text-muted">{data[hover].date}</span>
          <span className="ml-2 font-medium">
            {data[hover].views.toLocaleString(locale === "en" ? "en-US" : "fr-FR")}{" "}
            {t("analytics.viewsUnit")}
          </span>
        </div>
      )}
    </div>
  );
}
