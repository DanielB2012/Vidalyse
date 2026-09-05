"use client";

import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import type { Band, ChannelComparison, PrePublishEstimate } from "@/lib/analysis/types";
import type { PerformanceEstimate } from "@/lib/analysis/performanceEstimate";
import { formatRange } from "@/lib/analysis/performanceEstimate";
import { Accordion, Card, Chip, EmptyNote } from "./primitives";
import { useT } from "@/i18n/LanguageProvider";

const BAND_TONE: Record<Band, "success" | "warning" | "muted" | "danger"> = {
  "signal positif": "success",
  neutre: "muted",
  "signal faible": "danger",
  insuffisant: "warning",
};
const BAND_KEY: Record<Band, string> = {
  "signal positif": "prePublishPanel.bandPositive",
  neutre: "prePublishPanel.bandNeutral",
  "signal faible": "prePublishPanel.bandWeak",
  insuffisant: "prePublishPanel.bandInsufficient",
};

interface Response {
  prePublish: PrePublishEstimate;
  performance: PerformanceEstimate;
  comparison: ChannelComparison | null;
}

function BandRow({ label, band, note }: { label: string; band: Band; note?: string }) {
  const { t } = useT();
  return (
    <div className="flex flex-wrap items-baseline gap-2 border-b border-border py-2 last:border-0">
      <span className="w-40 shrink-0 text-sm text-muted">{label}</span>
      <Chip tone={BAND_TONE[band]}>{t(BAND_KEY[band] ?? band)}</Chip>
      {note && <span className="text-xs text-muted">{note}</span>}
    </div>
  );
}

export function PrePublishPanel({ videoId, defaultTitle }: { videoId: string; defaultTitle: string | null }) {
  const { t } = useT();
  const [title, setTitle] = useState(defaultTitle ?? "");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<Response | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/videos/${videoId}/pre-publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim() || null }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? t("analysis.genericFailure"));
      setData(json as Response);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("analysis.networkError"));
    } finally {
      setLoading(false);
    }
  }

  const pp = data?.prePublish;
  const perf = data?.performance;

  return (
    <div className="space-y-4">
      <Card title={t("prePublishPanel.title")} subtitle={t("prePublishPanel.subtitle")}>
        <label className="block text-xs text-muted">
          {t("prePublishPanel.plannedTitle")}
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("prePublishPanel.titlePlaceholder")}
            className="mt-1 w-full rounded-lg border border-border-strong bg-surface-raised px-3 py-2 text-sm text-foreground placeholder:text-muted"
          />
        </label>
        <button
          onClick={run}
          disabled={loading}
          className="mt-3 flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
          {loading ? t("prePublishPanel.estimating") : t("prePublishPanel.estimate")}
        </button>
        {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      </Card>

      {pp && !pp.available && <Card><EmptyNote>{pp.reason}</EmptyNote></Card>}

      {pp && pp.available && (
        <Card
          title={t("prePublishPanel.signalsTitle")}
          right={
            <Chip tone={pp.uncertainty === "faible" ? "success" : pp.uncertainty === "moyenne" ? "warning" : "danger"}>
              {t("prePublishPanel.uncertaintyChip", { level: pp.uncertainty })}
            </Chip>
          }
        >
          <BandRow label={t("prePublishPanel.hookStrength")} band={pp.hookStrength} />
          <BandRow label={t("prePublishPanel.titleFit")} band={pp.titleFit} />
          <BandRow label={t("prePublishPanel.formatPotential")} band={pp.formatPotential} />
          <BandRow label={t("prePublishPanel.pacing")} band={pp.pacing} />
          <BandRow label={t("prePublishPanel.viewsPotential")} band={pp.viewsPotential.band} note={pp.viewsPotential.note} />
          <BandRow label={t("prePublishPanel.likesPotential")} band={pp.likesPotential.band} note={pp.likesPotential.note} />
        </Card>
      )}

      {perf && (
        <Card
          title={t("prePublishPanel.perfTitle")}
          subtitle={t("prePublishPanel.perfSubtitle", {
            type: perf.contentType,
            method:
              perf.method === "historique_chaine"
                ? t("prePublishPanel.methodHistory")
                : t("prePublishPanel.methodQualitative"),
          })}
        >
          {!perf.available ? (
            <EmptyNote>{perf.reason}</EmptyNote>
          ) : (
            <>
              <div className="grid gap-2 sm:grid-cols-2">
                <RangeTile label={t("prePublishPanel.mViews")} range={formatRange(perf.metrics.views)} />
                <RangeTile label={t("prePublishPanel.mLikes")} range={formatRange(perf.metrics.likes)} />
                <RangeTile label={t("prePublishPanel.mComments")} range={formatRange(perf.metrics.comments)} />
                <RangeTile label={t("prePublishPanel.mAvgPercent")} range={formatRange(perf.metrics.avgViewPercentage)} />
              </div>
              <p className="mt-2 text-xs text-muted">
                {t("prePublishPanel.rangeNote1")}
                <strong>{perf.confidence}</strong>
                {t("prePublishPanel.rangeNote2", { count: perf.basisCount })}
              </p>
            </>
          )}

          <div className="mt-3">
            <Accordion title={t("prePublishPanel.whyEstimate")}>
              <div className="space-y-3 text-sm">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t("prePublishPanel.dataUsed")}</p>
                  <ul className="mt-1 list-disc pl-4 text-muted">
                    {(perf?.dataUsed ?? []).map((d, i) => <li key={i}>{d}</li>)}
                    {(perf?.dataUsed ?? []).length === 0 && <li>{t("prePublishPanel.localOnly")}</li>}
                  </ul>
                </div>
                {data?.comparison?.available && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t("prePublishPanel.comparedVideos")}</p>
                    <ul className="mt-1 list-disc pl-4 text-muted">
                      {data.comparison.matches.map((m, i) => (
                        <li key={i}>
                          {m.performanceDetail?.views != null
                            ? t("prePublishPanel.similarityViews", {
                                title: m.title,
                                pct: (m.similarity * 100).toFixed(0),
                                views: m.performanceDetail.views,
                              })
                            : t("prePublishPanel.similarity", {
                                title: m.title,
                                pct: (m.similarity * 100).toFixed(0),
                              })}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {perf && perf.factors.positive.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-success">{t("prePublishPanel.positiveFactors")}</p>
                    <ul className="mt-1 list-disc pl-4">{perf.factors.positive.map((f, i) => <li key={i}>{f}</li>)}</ul>
                  </div>
                )}
                {perf && perf.factors.negative.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-danger">{t("prePublishPanel.negativeFactors")}</p>
                    <ul className="mt-1 list-disc pl-4">{perf.factors.negative.map((f, i) => <li key={i}>{f}</li>)}</ul>
                  </div>
                )}
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-warning">{t("prePublishPanel.uncertainties")}</p>
                  <ul className="mt-1 list-disc pl-4 text-muted">
                    {(perf?.factors.uncertainties ?? []).map((f, i) => <li key={i}>{f}</li>)}
                  </ul>
                </div>
              </div>
            </Accordion>
          </div>
        </Card>
      )}

      {pp && pp.available && (
        <Card title={t("prePublishPanel.limits")}>
          <ul className="list-disc space-y-1 pl-4 text-sm text-muted">
            {pp.caveats.map((c, i) => <li key={i}>{c}</li>)}
          </ul>
        </Card>
      )}
    </div>
  );
}

function RangeTile({ label, range }: { label: string; range: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface-raised/50 p-3">
      <p className="text-[11px] text-muted">{label}</p>
      <p className="mt-0.5 text-sm font-semibold">{range}</p>
    </div>
  );
}
