"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Markdown } from "@/components/ui/Markdown";
import type { StructuredEvent } from "@/lib/ai/providers/types";
import type { MergedAnalysis, TranscriptSegment } from "@/lib/pipeline/types";
import type {
  ChannelComparison,
  CrossAnalysis,
  HighlightScoringResult,
  HookAnalysis,
  SceneDetectionResult,
  VideoStructure,
} from "@/lib/analysis/types";
import { useSeek } from "./seek-context";
import { Accordion, BasisTag, Card, Chip, EmptyNote, Meter, TimestampButton, msToClock } from "./primitives";
import { useT } from "@/i18n/LanguageProvider";

// ---------------- Overview ----------------

export function OverviewPanel({
  summary,
  cross,
  textSynthesis,
}: {
  summary: string | null;
  cross: CrossAnalysis | null;
  textSynthesis: string | null;
}) {
  const { t } = useT();
  return (
    <div className="space-y-4">
      <Card title={t("panels.generalSummary")}>
        {summary ? (
          <Markdown className="text-sm">{summary}</Markdown>
        ) : (
          <EmptyNote>{t("panels.aiSummaryFailed")}</EmptyNote>
        )}
      </Card>

      {cross ? (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <Card title={t("panels.strengths")}>
              {cross.strengths.length ? (
                <ul className="space-y-2 text-sm">
                  {cross.strengths.map((s, i) => (
                    <li key={i} className="flex flex-wrap items-baseline gap-1.5">
                      <BasisTag basis={s.basis} />
                      <span>{s.text}</span>
                      {s.atMs != null && <TimestampButton ms={s.atMs} />}
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyNote>{t("panels.noStrengths")}</EmptyNote>
              )}
            </Card>
            <Card title={t("panels.weaknesses")}>
              {cross.weaknesses.length ? (
                <ul className="space-y-2 text-sm">
                  {cross.weaknesses.map((s, i) => (
                    <li key={i} className="flex flex-wrap items-baseline gap-1.5">
                      <BasisTag basis={s.basis} />
                      <span>{s.text}</span>
                      {s.atMs != null && <TimestampButton ms={s.atMs} />}
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyNote>{t("panels.noWeaknesses")}</EmptyNote>
              )}
            </Card>
          </div>

          {cross.crossInsights.length > 0 && (
            <Card title={t("panels.crossSources")} subtitle={t("panels.crossSourcesSubtitle")}>
              <ul className="space-y-2 text-sm">
                {cross.crossInsights.map((c, i) => (
                  <li key={i} className="flex flex-wrap items-baseline gap-1.5">
                    <Chip tone={c.kind === "contradiction" ? "danger" : "accent"}>
                      {c.kind === "contradiction" ? t("panels.contradiction") : t("panels.correlation")}
                    </Chip>
                    <span className="text-muted">{c.sources.join(" + ")} :</span>
                    <span>{c.text}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <Card title={t("panels.recommendations")}>
              {cross.recommendations.length ? (
                <ul className="space-y-3 text-sm">
                  {cross.recommendations.map((r, i) => (
                    <li key={i}>
                      <div className="flex flex-wrap items-baseline gap-1.5">
                        <span>{r.text}</span>
                        {r.atMs != null && <TimestampButton ms={r.atMs} />}
                      </div>
                      {r.rationale && <p className="mt-0.5 text-xs text-muted">{r.rationale}</p>}
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyNote>{t("panels.noRecommendations")}</EmptyNote>
              )}
            </Card>
            <Card title={t("panels.hypotheses")}>
              {cross.hypotheses.length ? (
                <ul className="list-disc space-y-1.5 pl-4 text-sm text-muted">
                  {cross.hypotheses.map((h, i) => (
                    <li key={i}>{h}</li>
                  ))}
                </ul>
              ) : (
                <EmptyNote>{t("panels.noHypotheses")}</EmptyNote>
              )}
            </Card>
          </div>

          {cross.keyMoments.length > 0 && (
            <Card title={t("panels.keyMoments")}>
              <ul className="space-y-2 text-sm">
                {cross.keyMoments.map((k, i) => (
                  <li key={i} className="flex flex-wrap items-baseline gap-2">
                    <TimestampButton ms={k.atMs} />
                    <span className="font-medium">{k.text}</span>
                    {k.why && <span className="text-muted">— {k.why}</span>}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      ) : (
        textSynthesis && (
          <Card title={t("panels.textSynthesis")} subtitle={t("panels.textSynthesisSubtitle")}>
            <Markdown className="text-sm">{textSynthesis}</Markdown>
          </Card>
        )
      )}
    </div>
  );
}

// ---------------- Highlights ----------------

export function HighlightsPanel({ data }: { data: HighlightScoringResult | null }) {
  const { t } = useT();
  if (!data) {
    return (
      <Card title={t("panels.highlights")}>
        <EmptyNote>{t("panels.highlightsOld")}</EmptyNote>
      </Card>
    );
  }
  if (data.note) {
    return (
      <Card title={t("panels.highlights")}>
        <EmptyNote>{data.note}</EmptyNote>
      </Card>
    );
  }
  return (
    <div className="space-y-4">
      <Card title={t("panels.highlights")} subtitle={t("panels.highlightsWindow", { window: data.windowSec, disclaimer: data.disclaimer })}>
        {data.highlights.length ? (
          <ul className="space-y-3">
            {data.highlights.map((h, i) => (
              <li key={i} className="rounded-xl border border-border bg-surface-raised/40 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <TimestampButton ms={h.startMs} />
                    <span className="text-xs text-muted">→ {msToClock(h.endMs)}</span>
                  </div>
                  <span className="text-sm font-semibold">{Math.round(h.score)}<span className="text-xs text-muted">/100</span></span>
                </div>
                <div className="mt-2"><Meter value={h.score} tone={h.score >= 60 ? "success" : "accent"} /></div>
                {h.reasons.length > 0 && <p className="mt-2 text-sm">{h.reasons.join(" · ")}</p>}
                <div className="mt-2 flex flex-wrap gap-1">
                  {h.signals.map((s) => (
                    <Chip key={s} tone="accent">{s}</Chip>
                  ))}
                </div>
                <Accordion title={t("panels.scoreDetail")}>
                  <ul className="space-y-1 text-xs">
                    {h.contributions.map((c) => (
                      <li key={c.key} className="flex items-center justify-between gap-2">
                        <span className="text-muted">{c.label}</span>
                        <span className="font-mono">
                          {c.value.toFixed(2)} × {c.weight > 0 ? "+" : ""}{c.weight}
                        </span>
                      </li>
                    ))}
                  </ul>
                </Accordion>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyNote>{t("panels.noHighlight")}</EmptyNote>
        )}
      </Card>

      {data.weakMoments.length > 0 && (
        <Card title={t("panels.weakMoments")}>
          <ul className="space-y-2 text-sm">
            {data.weakMoments.map((w, i) => (
              <li key={i} className="flex flex-wrap items-baseline gap-2">
                <TimestampButton ms={w.startMs} />
                <span className="text-xs text-muted">→ {msToClock(w.endMs)}</span>
                <span>{w.reasons.join(" · ")}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

// ---------------- Structure ----------------

const STRUCTURE_TONE: Record<string, "accent" | "success" | "warning" | "muted" | "danger"> = {
  hook: "accent",
  intro: "muted",
  developpement: "success",
  changement_de_sujet: "warning",
  passage_important: "accent",
  conclusion: "success",
  appel_a_action: "warning",
  outro: "muted",
};

export function StructurePanel({ data }: { data: VideoStructure | null }) {
  const { t } = useT();
  if (!data) {
    return (
      <Card title={t("panels.structureTitle")}>
        <EmptyNote>{t("panels.structureUnavailable")}</EmptyNote>
      </Card>
    );
  }
  return (
    <Card
      title={t("panels.structureTitle")}
      subtitle={data.aiRefined ? t("panels.structureAiRefined") : t("panels.structureHeuristic")}
    >
      {data.undetermined && data.note && (
        <div className="mb-3"><EmptyNote>{data.note}</EmptyNote></div>
      )}
      {data.segments.length ? (
        <ul className="space-y-2">
          {data.segments.map((s, i) => (
            <li key={i} className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface-raised/40 p-2.5 text-sm">
              <Chip tone={STRUCTURE_TONE[s.kind] ?? "muted"}>{s.label}</Chip>
              <TimestampButton ms={s.startMs} />
              <span className="text-xs text-muted">→ {msToClock(s.endMs)}</span>
              <span className="text-xs text-muted">{t("panels.confidencePrefix", { confidence: s.confidence })}</span>
              {s.basis.length > 0 && <span className="w-full text-xs text-muted">{s.basis.join(" — ")}</span>}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyNote>{t("panels.noSegment")}</EmptyNote>
      )}
    </Card>
  );
}

// ---------------- Hook ----------------

export function HookPanel({ data }: { data: HookAnalysis | null }) {
  const { t } = useT();
  if (!data) {
    return (
      <Card title={t("panels.hookTitle")}>
        <EmptyNote>{t("panels.hookUnavailable")}</EmptyNote>
      </Card>
    );
  }
  if (!data.available) {
    return (
      <Card title={t("panels.hookTitle")}>
        <EmptyNote>{data.reason ?? t("panels.hookInsufficient")}</EmptyNote>
      </Card>
    );
  }
  return (
    <div className="space-y-4">
      <Card title={t("panels.hookHeading", { seconds: Math.round(data.windowMs / 1000) })}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label={t("panels.speechRate")} value={data.wordsPerSecond != null ? t("panels.wordsPerSec", { n: data.wordsPerSecond }) : t("panels.perfNA")} />
          <Stat label={t("panels.sceneCuts")} value={String(data.sceneCutCount)} />
          <Stat label={t("panels.visualEvents")} value={String(data.visionEventCount)} />
          <Stat label={t("panels.volumeVsRest")} value={data.loudnessVsRestDb != null ? `${data.loudnessVsRestDb} LU` : t("panels.perfNA")} />
        </div>
        {data.firstWords && (
          <p className="mt-3 rounded-lg border border-border bg-surface-raised/40 p-3 text-sm italic">“{data.firstWords}”</p>
        )}
      </Card>

      <Card title={t("panels.promiseConsistency")} subtitle={data.aiUsed ? t("panels.aiInterpretation") : t("panels.aiUnavailableRaw")}>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Chip tone={data.consistency === "coherent" ? "success" : data.consistency === "incoherent" ? "danger" : "warning"}>
            {t("panels.consistencyPrefix", { value: data.consistency })}
          </Chip>
          {data.promiseDeliveredAtMs != null && (
            <span className="flex items-center gap-1 text-muted">{t("panels.deliveredAround")} <TimestampButton ms={data.promiseDeliveredAtMs} /></span>
          )}
        </div>
        {data.promise && <p className="mt-2 text-sm"><span className="text-muted">{t("panels.promisePrefix")}</span> {data.promise}</p>}
        {data.observations.length > 0 && (
          <>
            <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted">{t("panels.observations")}</p>
            <ul className="mt-1 list-disc space-y-1 pl-4 text-sm">
              {data.observations.map((o, i) => <li key={i}>{o}</li>)}
            </ul>
          </>
        )}
        {data.recommendations.length > 0 && (
          <>
            <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted">{t("panels.hookRecommendations")}</p>
            <ul className="mt-1 list-disc space-y-1 pl-4 text-sm">
              {data.recommendations.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          </>
        )}
      </Card>
    </div>
  );
}

// ---------------- Vision ----------------

export function VisionPanel({
  events,
  scene,
}: {
  events: StructuredEvent[] | null;
  scene: SceneDetectionResult | null;
}) {
  const { t } = useT();
  return (
    <div className="space-y-4">
      <Card
        title={t("panels.visionTitle")}
        subtitle={t("panels.visionSubtitle")}
      >
        {events?.length ? (
          <ul className="max-h-[28rem] space-y-2 overflow-y-auto text-sm">
            {events.map((ev, i) => (
              <li key={i} className="flex flex-wrap items-baseline gap-2">
                <TimestampButton ms={ev.timestampMs} />
                <span className="text-xs text-muted">({ev.type})</span>
                <span>{ev.description}</span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyNote>{t("panels.noVisionEvent")}</EmptyNote>
        )}
      </Card>

      <Card title={t("panels.sceneDetection")}>
        {scene && scene.changes.length ? (
          <>
            {scene.note && <p className="mb-2 text-xs text-warning">{scene.note}</p>}
            <p className="text-sm text-muted">
              {t("panels.sceneSummary", { cuts: scene.changes.filter((c) => c.isCut).length, frames: scene.frameCount, mean: (scene.meanChange * 100).toFixed(0) })}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {scene.changes
                .filter((c) => c.isCut)
                .map((c, i) => (
                  <TimestampButton key={i} ms={c.timestampMs} />
                ))}
            </div>
          </>
        ) : (
          <EmptyNote>{scene?.note ?? t("panels.sceneUnavailable")}</EmptyNote>
        )}
      </Card>
    </div>
  );
}

// ---------------- Audio ----------------

export function AudioPanel({ audio, durationSec }: { audio: MergedAnalysis["audioDsp"]; durationSec: number }) {
  const { t } = useT();
  if (!audio) {
    return (
      <Card title={t("panels.audioTitle")}>
        <EmptyNote>{t("panels.noAudio")}</EmptyNote>
      </Card>
    );
  }
  const totalSilence = audio.silences.reduce((s, x) => {
    const end = x.endSec ?? durationSec;
    return s + Math.max(0, end - x.startSec);
  }, 0);
  const loud = audio.loudnessSeries ?? [];
  const maxLoud = loud.length ? Math.max(...loud.map((p) => p.momentaryLufs)) : null;
  const minLoud = loud.length ? Math.min(...loud.map((p) => p.momentaryLufs)) : null;
  return (
    <div className="space-y-4">
      <Card title={t("panels.audioMeasures")} subtitle={t("panels.audioMeasuresSubtitle")}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label={t("panels.meanVolume")} value={audio.meanVolumeDb != null ? `${audio.meanVolumeDb} dB` : t("panels.perfNA")} />
          <Stat label={t("panels.maxVolume")} value={audio.maxVolumeDb != null ? `${audio.maxVolumeDb} dB` : t("panels.perfNA")} />
          <Stat label={t("panels.silences")} value={String(audio.silences.length)} />
          <Stat label={t("panels.cumulativeSilence")} value={`${totalSilence.toFixed(1)} s`} />
        </div>
        {durationSec > 0 && (
          <p className="mt-2 text-xs text-muted">
            {t("panels.silencePercent", { pct: ((totalSilence / durationSec) * 100).toFixed(0) })}
          </p>
        )}
      </Card>

      {loud.length > 0 && (
        <Card title={t("panels.loudnessCurve")} subtitle={t("panels.loudnessSubtitle", { count: loud.length, min: minLoud?.toFixed(1) ?? "?", max: maxLoud?.toFixed(1) ?? "?" })}>
          <LoudnessSparkline points={loud} durationSec={durationSec} />
        </Card>
      )}

      {audio.silences.length > 0 && (
        <Card title={t("panels.silenceDistribution")}>
          <div className="relative h-6 w-full overflow-hidden rounded bg-surface-raised">
            {audio.silences.map((s, i) => {
              const end = s.endSec ?? durationSec;
              const left = durationSec ? (s.startSec / durationSec) * 100 : 0;
              const width = durationSec ? Math.max(0.5, ((end - s.startSec) / durationSec) * 100) : 0;
              return (
                <div key={i} className="absolute top-0 bottom-0 bg-muted/60" style={{ left: `${left}%`, width: `${width}%` }} />
              );
            })}
          </div>
          <ul className="mt-2 space-y-1 text-xs text-muted">
            {audio.silences.map((s, i) => (
              <li key={i}>
                {s.startSec.toFixed(1)}s → {s.endSec != null ? `${s.endSec.toFixed(1)}s` : t("panels.silenceEnd")} (
                {((s.endSec ?? durationSec) - s.startSec).toFixed(1)}s)
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function LoudnessSparkline({ points, durationSec }: { points: { tSec: number; momentaryLufs: number }[]; durationSec: number }) {
  const min = Math.min(...points.map((p) => p.momentaryLufs));
  const max = Math.max(...points.map((p) => p.momentaryLufs));
  const range = max - min || 1;
  const w = 600;
  const h = 80;
  const d = points
    .map((p, i) => {
      const x = durationSec ? (p.tSec / durationSec) * w : (i / points.length) * w;
      const y = h - ((p.momentaryLufs - min) / range) * h;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-20 w-full" preserveAspectRatio="none">
      <path d={d} fill="none" stroke="var(--accent)" strokeWidth={1.5} />
    </svg>
  );
}

// ---------------- Transcript ----------------

const TRANSCRIPT_SOURCE_LABEL: Record<string, { key: string; tone: "success" | "warning" | "muted" }> = {
  author_subtitles_embedded: { key: "panels.srcEmbedded", tone: "success" },
  author_subtitles_sidecar: { key: "panels.srcSidecar", tone: "success" },
  whisper_local: { key: "panels.srcWhisper", tone: "warning" },
  vision_ocr: { key: "panels.srcOcr", tone: "warning" },
};

export function TranscriptPanel({
  segments,
  source,
}: {
  segments: TranscriptSegment[] | null;
  source: string | null | undefined;
}) {
  const { seekTo } = useSeek();
  const { t } = useT();
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    if (!segments) return [];
    const needle = q.trim().toLowerCase();
    if (!needle) return segments;
    return segments.filter((s) => s.text.toLowerCase().includes(needle));
  }, [segments, q]);

  if (!segments?.length) {
    return (
      <Card title={t("panels.transcriptTitle")}>
        <EmptyNote>{t("panels.noTranscript")}</EmptyNote>
      </Card>
    );
  }
  const srcInfo = source ? TRANSCRIPT_SOURCE_LABEL[source] : null;

  return (
    <Card title={t("panels.transcriptTitle")} subtitle={t("panels.transcriptSubtitle", { count: segments.length })}>
      {srcInfo && (
        <p className="mb-3">
          <Chip tone={srcInfo.tone}>{t(srcInfo.key)}</Chip>
        </p>
      )}
      <div className="mb-3 flex items-center gap-2 rounded-lg border border-border-strong bg-surface-raised px-2.5 py-1.5">
        <Search size={14} className="text-muted" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("panels.transcriptSearch")}
          className="w-full bg-transparent text-sm outline-none placeholder:text-muted"
        />
        {q && <span className="shrink-0 text-xs text-muted">{filtered.length}</span>}
      </div>
      <ul className="max-h-[32rem] space-y-1.5 overflow-y-auto text-sm">
        {filtered.map((seg, i) => (
          <li key={i}>
            <button
              onClick={() => seekTo?.(seg.timestampMs)}
              className="flex w-full gap-2 rounded px-1 py-0.5 text-left hover:bg-surface-raised/60"
            >
              <span className="shrink-0 font-mono text-xs text-accent">{msToClock(seg.timestampMs)}</span>
              <span>{highlight(seg.text, q)}</span>
            </button>
          </li>
        ))}
        {filtered.length === 0 && <li className="text-muted">{t("panels.noSegmentContains", { q })}</li>}
      </ul>
    </Card>
  );
}

function highlight(text: string, q: string) {
  const needle = q.trim();
  if (!needle) return text;
  const idx = text.toLowerCase().indexOf(needle.toLowerCase());
  if (idx < 0) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded bg-accent/30 text-foreground">{text.slice(idx, idx + needle.length)}</mark>
      {text.slice(idx + needle.length)}
    </>
  );
}

// ---------------- YouTube ----------------

export function YouTubePanel({
  stats,
  linked,
}: {
  stats: Record<string, number | string | null> | null;
  linked: boolean;
}) {
  const { t } = useT();
  return (
    <div className="space-y-4">
      <Card title={t("panels.youtubeData")} subtitle={t("panels.youtubeDataSubtitle")}>
        {linked && stats ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {Object.entries(stats).map(([k, v]) => (
              <Stat key={k} label={k} value={v == null ? t("panels.dataUnavailable") : String(v)} />
            ))}
          </div>
        ) : (
          <EmptyNote>
            {t("panels.notLinkedYoutube")}
          </EmptyNote>
        )}
      </Card>
      <Card title={t("panels.ytApiMissing")}>
        <ul className="list-disc space-y-1 pl-4 text-sm text-muted">
          <li>{t("panels.ytMissing1")}</li>
          <li>{t("panels.ytMissing2")}</li>
        </ul>
        <p className="mt-2 text-xs text-muted">{t("panels.ytMissingNote")}</p>
      </Card>
    </div>
  );
}

// ---------------- Comparison ----------------

export function ComparisonPanel({ data, videoId }: { data: ChannelComparison | null; videoId: string }) {
  const { t } = useT();
  const [live, setLive] = useState<ChannelComparison | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const shown = live ?? data;

  async function loadDetailed() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/videos/${videoId}/comparison`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? t("panels.genericFailure"));
      setLive(json as ChannelComparison);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("panels.networkError"));
    } finally {
      setLoading(false);
    }
  }

  if (!shown) {
    return (
      <Card title={t("panels.comparisonTitle")}>
        <EmptyNote>{t("panels.comparisonUnavailable")}</EmptyNote>
      </Card>
    );
  }
  if (!shown.available) {
    return (
      <Card title={t("panels.comparisonTitle")}>
        <EmptyNote>{shown.reason ?? t("panels.comparisonNoData")}</EmptyNote>
      </Card>
    );
  }
  return (
    <Card
      title={t("panels.comparisonTitle")}
      subtitle={shown.note ?? undefined}
      right={
        <button
          onClick={loadDetailed}
          disabled={loading}
          className="rounded-lg border border-border-strong px-2.5 py-1 text-xs text-muted hover:text-foreground disabled:opacity-50"
        >
          {loading ? t("panels.loadingShort") : t("panels.detailedComparison")}
        </button>
      }
    >
      <p className="mb-2">
        <Chip tone={shown.method === "semantique" ? "success" : "muted"}>
          {t("panels.methodPrefix", { value: shown.method === "semantique" ? t("panels.methodSemantic") : t("panels.methodLexical") })}
        </Chip>
      </p>
      {error && <p className="mb-2 text-sm text-danger">{error}</p>}
      <ul className="space-y-2 text-sm">
        {shown.matches.map((m, i) => (
          <li key={i} className="rounded-lg border border-border bg-surface-raised/40 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{m.title}</span>
              <span className="text-xs text-muted">{t("panels.similarityShort", { pct: (m.similarity * 100).toFixed(0) })}</span>
            </div>
            <div className="mt-1 flex flex-wrap gap-1">
              {m.sharedTraits.map((t) => (
                <Chip key={t}>{t}</Chip>
              ))}
            </div>
            {m.performanceDetail ? (
              <div className="mt-2 grid grid-cols-2 gap-1 text-xs text-muted sm:grid-cols-3">
                <span>{t("panels.perfViews", { v: m.performanceDetail.views ?? t("panels.perfNA") })}</span>
                <span>{t("panels.perfLikes", { v: m.performanceDetail.likes ?? t("panels.perfNA") })}</span>
                <span>{t("panels.perfComments", { v: m.performanceDetail.comments ?? t("panels.perfNA") })}</span>
                <span>{t("panels.perfMinWatched", { v: m.performanceDetail.estimatedMinutesWatched ?? t("panels.perfNA") })}</span>
                <span>{t("panels.perfAvgPercent", { v: m.performanceDetail.averageViewPercentage ?? t("panels.perfNA") })}</span>
                <span>{t("panels.perfSubs", { v: m.performanceDetail.subscribersGained ?? t("panels.perfNA") })}</span>
              </div>
            ) : m.performanceDetail === null ? (
              <p className="mt-1 text-xs text-muted">{t("panels.noYoutubeStats")}</p>
            ) : m.performance ? (
              <p className="mt-1 text-xs text-muted">
                {t("panels.perfLine", { views: m.performance.views ?? t("panels.perfNA"), pct: m.performance.avgViewPercentage ?? t("panels.perfNA") })}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </Card>
  );
}

// ---------------- shared ----------------

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface-raised/50 p-2.5">
      <p className="text-[11px] text-muted">{label}</p>
      <p className="mt-0.5 text-sm font-semibold">{value}</p>
    </div>
  );
}
