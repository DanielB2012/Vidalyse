"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import type { TimelineEvent, TimelineEventType } from "@/lib/analysis/types";
import { useSeek } from "./seek-context";
import { useT } from "@/i18n/LanguageProvider";
import { Card, EmptyNote, msToClock } from "./primitives";

const LANES: { type: TimelineEventType; labelKey: string; color: string }[] = [
  { type: "highlight", labelKey: "analysis.laneHighlights", color: "bg-success" },
  { type: "weak_moment", labelKey: "analysis.laneWeak", color: "bg-danger" },
  { type: "vision_event", labelKey: "analysis.laneVision", color: "bg-accent" },
  { type: "scene_change", labelKey: "analysis.laneScenes", color: "bg-accent-2" },
  { type: "speech", labelKey: "analysis.laneSpeech", color: "bg-foreground/40" },
  { type: "audio_peak", labelKey: "analysis.laneAudioPeaks", color: "bg-warning" },
  { type: "silence", labelKey: "analysis.laneSilence", color: "bg-muted/50" },
];

export function Timeline({
  events,
  durationMs,
}: {
  events: TimelineEvent[];
  durationMs: number;
}) {
  const { seekTo } = useSeek();
  const { t } = useT();
  const [hover, setHover] = useState<TimelineEvent | null>(null);
  const [activeLanes, setActiveLanes] = useState<Set<TimelineEventType>>(
    () => new Set(LANES.map((l) => l.type))
  );

  const byLane = useMemo(() => {
    const map = new Map<TimelineEventType, TimelineEvent[]>();
    for (const lane of LANES) map.set(lane.type, []);
    for (const ev of events) {
      const arr = map.get(ev.type);
      if (arr) arr.push(ev);
    }
    return map;
  }, [events]);

  if (!events.length || durationMs <= 0) {
    return (
      <Card title={t("analysis.timelineTitle")}>
        <EmptyNote>{t("analysis.timelineEmpty")}</EmptyNote>
      </Card>
    );
  }

  const pct = (ms: number) => `${Math.max(0, Math.min(100, (ms / durationMs) * 100))}%`;

  return (
    <Card
      title={t("analysis.timelineHeading")}
      subtitle={t("analysis.timelineSubtitle")}
    >
      <div className="mb-3 flex flex-wrap gap-1.5">
        {LANES.map((lane) => {
          const on = activeLanes.has(lane.type);
          const n = byLane.get(lane.type)?.length ?? 0;
          return (
            <button
              key={lane.type}
              onClick={() =>
                setActiveLanes((prev) => {
                  const next = new Set(prev);
                  if (next.has(lane.type)) next.delete(lane.type);
                  else next.add(lane.type);
                  return next;
                })
              }
              className={clsx(
                "flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] transition",
                on ? "border-border-strong text-foreground" : "border-border text-muted opacity-50"
              )}
            >
              <span className={clsx("h-2 w-2 rounded-full", lane.color)} />
              {t(lane.labelKey)} <span className="text-muted">{n}</span>
            </button>
          );
        })}
      </div>

      <div className="relative overflow-hidden rounded-xl border border-border bg-surface-raised/50 p-3">
        {/* highlight / weak bands behind the lanes */}
        <div className="pointer-events-none absolute inset-x-3 inset-y-0">
          {events
            .filter((e) => (e.type === "highlight" || e.type === "weak_moment") && activeLanes.has(e.type))
            .map((e) => (
              <div
                key={`band-${e.id}`}
                className={clsx(
                  "absolute top-0 bottom-0 rounded",
                  e.type === "highlight" ? "bg-success/10" : "bg-danger/10"
                )}
                style={{ left: pct(e.startMs), width: pct((e.endMs ?? e.startMs) - e.startMs) }}
              />
            ))}
        </div>

        <div className="relative space-y-1.5">
          {LANES.filter((l) => activeLanes.has(l.type)).map((lane) => {
            const laneEvents = byLane.get(lane.type) ?? [];
            return (
              <div key={lane.type} className="relative flex items-center gap-2">
                <span className="w-16 shrink-0 text-right text-[10px] text-muted">{t(lane.labelKey)}</span>
                <div className="relative h-6 flex-1 rounded bg-surface">
                  {laneEvents.map((ev) => {
                    const width =
                      ev.endMs != null && ev.endMs > ev.startMs
                        ? `max(2px, ${pct(ev.endMs - ev.startMs)})`
                        : "3px";
                    return (
                      <button
                        key={ev.id}
                        onClick={() => seekTo?.(ev.startMs)}
                        onMouseEnter={() => setHover(ev)}
                        onMouseLeave={() => setHover((h) => (h?.id === ev.id ? null : h))}
                        className={clsx(
                          "absolute top-1 bottom-1 rounded-sm transition-opacity hover:opacity-100",
                          lane.color,
                          seekTo ? "cursor-pointer" : "cursor-default",
                          "opacity-80"
                        )}
                        style={{ left: pct(ev.startMs), width }}
                        aria-label={t("analysis.laneAtTime", {
                          lane: t(lane.labelKey),
                          time: msToClock(ev.startMs),
                        })}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* time axis */}
        <div className="mt-2 flex justify-between pl-[72px] text-[10px] text-muted">
          <span>0:00</span>
          <span>{msToClock(durationMs / 2)}</span>
          <span>{msToClock(durationMs)}</span>
        </div>
      </div>

      {hover && (
        <div className="mt-3 rounded-lg border border-border-strong bg-surface-raised p-3 text-xs">
          <p className="font-mono text-accent">
            {msToClock(hover.startMs)}
            {hover.endMs != null && hover.endMs > hover.startMs ? ` → ${msToClock(hover.endMs)}` : ""}
          </p>
          <p className="mt-0.5 font-medium">{hover.label}</p>
          {hover.detail && <p className="mt-0.5 text-muted">{hover.detail}</p>}
          <p className="mt-1 text-[10px] uppercase tracking-wide text-muted">
            {t("analysis.sourcePrefix", { source: hover.source.replace(/_/g, " ") })}
          </p>
        </div>
      )}
    </Card>
  );
}
