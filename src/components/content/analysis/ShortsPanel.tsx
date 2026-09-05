"use client";

import { useCallback, useEffect, useState } from "react";
import { Clapperboard, Download, Eye, Loader2, Save, Scissors, Trash2 } from "lucide-react";
import type { ShortProposal, ShortsResult } from "@/lib/analysis/types";
import { useSeek } from "./seek-context";
import { Card, Chip, EmptyNote, msToClock } from "./primitives";
import { useT } from "@/i18n/LanguageProvider";

interface EditableProposal extends ShortProposal {
  exportUrl?: string;
  exporting?: boolean;
  saving?: boolean;
  exportError?: string;
}

interface SavedClip {
  id: string;
  startMs: number;
  endMs: number;
  title: string | null;
  score: number | null;
  reason: string | null;
  vertical: boolean;
  burnedSubtitles: boolean;
  status: "PROPOSED" | "EXPORTED" | "FAILED";
  exportError: string | null;
  fileUrl: string | null;
  createdAt: string;
}

const DURATIONS = [15, 30, 45, 60];

export function ShortsPanel({
  videoId,
  hasResult,
  transcriptReliable,
}: {
  videoId: string;
  hasResult: boolean;
  transcriptReliable: boolean;
}) {
  const { seekTo } = useSeek();
  const { t } = useT();
  const [mode, setMode] = useState<"count" | "auto">("count");
  const [count, setCount] = useState(5);
  const [target, setTarget] = useState(30);
  const [vertical, setVertical] = useState(true);
  const [cropMode, setCropMode] = useState<"center" | "letterbox">("center");
  const [burnSubtitles, setBurnSubtitles] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ShortsResult | null>(null);
  const [proposals, setProposals] = useState<EditableProposal[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<SavedClip[]>([]);

  const loadSaved = useCallback(async () => {
    try {
      const res = await fetch(`/api/videos/${videoId}/shorts/clips`);
      if (res.ok) setSaved(await res.json());
    } catch {
      /* ignore */
    }
  }, [videoId]);

  useEffect(() => {
    if (hasResult) void loadSaved();
  }, [hasResult, loadSaved]);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/videos/${videoId}/shorts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count: mode === "count" ? count : null, targetDurationSec: target }),
      });
      const data = (await res.json()) as ShortsResult | { error: string };
      if (!res.ok || "error" in data) {
        setError(("error" in data && data.error) || t("shorts.genFailed"));
        setResult(null);
        setProposals([]);
        return;
      }
      setResult(data);
      setProposals(data.proposals.map((p) => ({ ...p })));
    } catch {
      setError(t("shorts.networkError"));
    } finally {
      setLoading(false);
    }
  }

  function updateBound(id: string, key: "startMs" | "endMs", seconds: number) {
    setProposals((prev) =>
      prev.map((p) => (p.id === id ? { ...p, [key]: Math.max(0, Math.round(seconds * 1000)), exportUrl: undefined } : p))
    );
  }

  async function exportClip(p: EditableProposal, save: boolean) {
    const flag = save ? "saving" : "exporting";
    setProposals((prev) => prev.map((x) => (x.id === p.id ? { ...x, [flag]: true, exportError: undefined } : x)));
    try {
      const res = await fetch(`/api/videos/${videoId}/shorts/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startMs: p.startMs,
          endMs: p.endMs,
          vertical,
          cropMode,
          burnSubtitles: burnSubtitles && transcriptReliable,
          save,
          score: p.score,
          reason: p.reason,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? t("shorts.exportFailed"));
      setProposals((prev) =>
        prev.map((x) => (x.id === p.id ? { ...x, [flag]: false, exportUrl: data.url } : x))
      );
      if (save) void loadSaved();
    } catch (e) {
      setProposals((prev) =>
        prev.map((x) =>
          x.id === p.id ? { ...x, [flag]: false, exportError: e instanceof Error ? e.message : t("shorts.failed") } : x
        )
      );
    }
  }

  async function deleteSaved(id: string) {
    await fetch(`/api/videos/${videoId}/shorts/clips/${id}`, { method: "DELETE" });
    void loadSaved();
  }

  if (!hasResult) {
    return (
      <Card title={t("shorts.title")}>
        <EmptyNote>{t("shorts.needAnalysis")}</EmptyNote>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card title={t("shorts.title")} subtitle={t("shorts.subtitle")}>
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex gap-1.5">
            <button
              onClick={() => setMode("count")}
              className={`rounded-lg border px-3 py-1.5 text-xs ${mode === "count" ? "border-accent/60 bg-accent/10 text-accent" : "border-border-strong text-muted"}`}
            >
              {t("shorts.modeCount")}
            </button>
            <button
              onClick={() => setMode("auto")}
              className={`rounded-lg border px-3 py-1.5 text-xs ${mode === "auto" ? "border-accent/60 bg-accent/10 text-accent" : "border-border-strong text-muted"}`}
            >
              {t("shorts.modeAuto")}
            </button>
          </div>

          {mode === "count" && (
            <label className="text-xs text-muted">
              {t("shorts.count")}
              <input
                type="number"
                min={1}
                max={20}
                value={count}
                onChange={(e) => setCount(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
                className="ml-2 w-16 rounded-md border border-border-strong bg-surface-raised px-2 py-1 text-sm text-foreground"
              />
            </label>
          )}

          <label className="text-xs text-muted">
            {t("shorts.targetDuration")}
            <select
              value={target}
              onChange={(e) => setTarget(Number(e.target.value))}
              className="ml-2 rounded-md border border-border-strong bg-surface-raised px-2 py-1 text-sm text-foreground"
            >
              {DURATIONS.map((d) => (
                <option key={d} value={d}>{d}s</option>
              ))}
            </select>
          </label>

          <button
            onClick={run}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Clapperboard size={14} />}
            {loading ? t("shorts.analyzing") : t("shorts.propose")}
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-4 border-t border-border pt-3 text-xs text-muted">
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={vertical} onChange={(e) => setVertical(e.target.checked)} />
            {t("shorts.verticalFormat")}
          </label>
          {vertical && (
            <label>
              {t("shorts.crop")}
              <select
                value={cropMode}
                onChange={(e) => setCropMode(e.target.value as "center" | "letterbox")}
                className="ml-1.5 rounded-md border border-border-strong bg-surface-raised px-2 py-1 text-foreground"
              >
                <option value="center">{t("shorts.cropCenter")}</option>
                <option value="letterbox">{t("shorts.cropLetterbox")}</option>
              </select>
            </label>
          )}
          <label className="flex items-center gap-1.5" title={transcriptReliable ? "" : t("shorts.noReliableTranscript")}>
            <input
              type="checkbox"
              checked={burnSubtitles && transcriptReliable}
              disabled={!transcriptReliable}
              onChange={(e) => setBurnSubtitles(e.target.checked)}
            />
            {t("shorts.burnSubtitles")}
          </label>
          {!transcriptReliable && (
            <span className="text-[11px]">{t("shorts.subtitlesUnavailable")}</span>
          )}
        </div>
        {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      </Card>

      {result && !result.ok && (
        <Card>
          <p className="text-sm text-warning">{result.reason}</p>
          <p className="mt-1 text-xs text-muted">
            {t("shorts.requestedVsUsable", { requested: result.requested ?? t("shorts.auto"), produced: result.produced })}
          </p>
        </Card>
      )}

      {proposals.length > 0 && (
        <Card title={t("shorts.proposedCount", { count: proposals.length })}>
          <ul className="space-y-3">
            {proposals.map((p) => (
              <li key={p.id} className="rounded-xl border border-border bg-surface-raised/40 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold">
                    {msToClock(p.startMs)} → {msToClock(p.endMs)}{" "}
                    <span className="text-xs text-muted">({((p.endMs - p.startMs) / 1000).toFixed(0)}s)</span>
                  </span>
                  <span className="text-xs text-muted">{t("shorts.score100", { score: Math.round(p.score) })}</span>
                </div>
                <p className="mt-1 text-sm">{p.reason}</p>
                {p.transcriptPreview && <p className="mt-1 text-xs italic text-muted">“{p.transcriptPreview}”</p>}
                <div className="mt-2 flex flex-wrap gap-1">
                  {p.signals.map((s) => <Chip key={s} tone="accent">{s}</Chip>)}
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted">
                  <label>
                    {t("shorts.startSec")}
                    <input
                      type="number"
                      min={0}
                      value={(p.startMs / 1000).toFixed(1)}
                      onChange={(e) => updateBound(p.id, "startMs", Number(e.target.value))}
                      className="ml-1.5 w-20 rounded-md border border-border-strong bg-surface px-2 py-1 text-foreground"
                    />
                  </label>
                  <label>
                    {t("shorts.endSec")}
                    <input
                      type="number"
                      min={0}
                      value={(p.endMs / 1000).toFixed(1)}
                      onChange={(e) => updateBound(p.id, "endMs", Number(e.target.value))}
                      className="ml-1.5 w-20 rounded-md border border-border-strong bg-surface px-2 py-1 text-foreground"
                    />
                  </label>
                  {seekTo && (
                    <button
                      onClick={() => seekTo(p.startMs)}
                      className="flex items-center gap-1 rounded-md border border-border-strong px-2 py-1 hover:border-accent/60"
                    >
                      <Eye size={12} /> {t("shorts.preview")}
                    </button>
                  )}
                  <button
                    onClick={() => exportClip(p, false)}
                    disabled={p.exporting || p.endMs <= p.startMs}
                    className="flex items-center gap-1 rounded-md border border-accent/50 bg-accent/10 px-2 py-1 text-accent hover:bg-accent/20 disabled:opacity-50"
                  >
                    {p.exporting ? <Loader2 size={12} className="animate-spin" /> : <Scissors size={12} />}
                    {t("shorts.export")}
                  </button>
                  <button
                    onClick={() => exportClip(p, true)}
                    disabled={p.saving || p.endMs <= p.startMs}
                    className="flex items-center gap-1 rounded-md border border-success/50 px-2 py-1 text-success hover:bg-success/10 disabled:opacity-50"
                  >
                    {p.saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                    {t("shorts.exportAndSave")}
                  </button>
                  {p.exportUrl && (
                    <a
                      href={p.exportUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 rounded-md border border-success/50 px-2 py-1 text-success"
                    >
                      <Download size={12} /> {t("shorts.openClip")}
                    </a>
                  )}
                  {p.exportError && <span className="text-danger">{p.exportError}</span>}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {saved.length > 0 && (
        <Card title={t("shorts.savedClips")} subtitle={t("shorts.savedSubtitle")}>
          <ul className="space-y-2">
            {saved.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface-raised/40 p-2.5 text-sm">
                <span className="font-mono text-xs">{msToClock(c.startMs)} → {msToClock(c.endMs)}</span>
                {c.vertical && <Chip tone="accent">9:16</Chip>}
                {c.burnedSubtitles && <Chip>{t("shorts.subtitlesChip")}</Chip>}
                <Chip tone={c.status === "EXPORTED" ? "success" : c.status === "FAILED" ? "danger" : "muted"}>
                  {c.status === "EXPORTED" ? t("shorts.statusExported") : c.status === "FAILED" ? t("shorts.statusFailed") : t("shorts.statusProposed")}
                </Chip>
                {c.score != null && <span className="text-xs text-muted">{t("shorts.score", { score: Math.round(c.score) })}</span>}
                {c.fileUrl && (
                  <a href={c.fileUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-accent">
                    <Download size={12} /> {t("shorts.open")}
                  </a>
                )}
                {c.exportError && <span className="text-xs text-danger">{c.exportError}</span>}
                <button onClick={() => deleteSaved(c.id)} className="ml-auto text-muted hover:text-danger" aria-label={t("shorts.delete")}>
                  <Trash2 size={13} />
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
