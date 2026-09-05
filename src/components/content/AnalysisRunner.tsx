"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Circle, XCircle, MinusCircle, Loader2, Play, RefreshCw } from "lucide-react";
import { useT } from "@/i18n/LanguageProvider";

const STAGES = [
  { key: "IMPORTED", labelKey: "runner.stageImported" },
  { key: "TECHNICAL_ANALYSIS", labelKey: "runner.stageTechnical" },
  { key: "AUDIO_EXTRACTION", labelKey: "runner.stageAudio" },
  { key: "FRAME_EXTRACTION", labelKey: "runner.stageFrames" },
  { key: "TRANSCRIPTION", labelKey: "runner.stageTranscription" },
  { key: "VISION_ANALYSIS", labelKey: "runner.stageVision" },
  { key: "MERGE", labelKey: "runner.stageMerge" },
  { key: "TEXT_SYNTHESIS", labelKey: "runner.stageTextSynthesis" },
  { key: "DONE", labelKey: "runner.stageDone" },
] as const;

type StageKey = (typeof STAGES)[number]["key"];

interface JobLog {
  stage: StageKey;
  status: "started" | "done" | "skipped" | "error";
  message: string | null;
  createdAt: string;
}

interface JobState {
  id: string;
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
  currentStage: StageKey;
  progress: number;
  error: string | null;
  result: Record<string, unknown> | null;
  logs: JobLog[];
  createdAt: string;
}

// Remaining time isn't tracked anywhere — there's no per-stage timing model to
// draw on — so it's extrapolated from how long the job has taken so far vs.
// how much progress it's made (elapsed * (100 / progress) - elapsed). A rough,
// assumed-true estimate that gets more accurate as progress advances, smoothed
// across polls so it doesn't jump around, and ticked down locally every
// second between polls for a live countdown feel.
const MIN_PROGRESS_FOR_ETA = 4;
const ETA_SMOOTHING = 0.4;

function formatEta(ms: number, t: (key: string, vars?: Record<string, string | number>) => string): string {
  const totalSec = Math.round(ms / 1000);
  if (totalSec < 60) return t("runner.etaSeconds", { seconds: Math.max(1, totalSec) });
  return t("runner.etaMinutes", { minutes: Math.max(1, Math.round(totalSec / 60)) });
}

export function AnalysisRunner({ videoId, initialJobId }: { videoId: string; initialJobId: string | null }) {
  const router = useRouter();
  const { t } = useT();
  const [jobId, setJobId] = useState<string | null>(initialJobId);
  const [job, setJob] = useState<JobState | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [etaMs, setEtaMs] = useState<number | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const refreshedRef = useRef(false);
  const etaRawRef = useRef<number | null>(null);

  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;

    async function poll() {
      const res = await fetch(`/api/jobs/${jobId}`);
      if (!res.ok || cancelled) return;
      const data = (await res.json()) as JobState;
      setJob(data);

      if (data.status === "RUNNING" && data.progress >= MIN_PROGRESS_FOR_ETA) {
        const elapsedMs = Date.now() - new Date(data.createdAt).getTime();
        const rawRemaining = Math.max(0, elapsedMs * (100 / data.progress) - elapsedMs);
        etaRawRef.current =
          etaRawRef.current == null
            ? rawRemaining
            : etaRawRef.current * (1 - ETA_SMOOTHING) + rawRemaining * ETA_SMOOTHING;
        setEtaMs(etaRawRef.current);
      } else if (data.status !== "RUNNING") {
        etaRawRef.current = null;
        setEtaMs(null);
      }

      if (data.status === "COMPLETED" || data.status === "FAILED") {
        if (pollRef.current) clearInterval(pollRef.current);
        // Pull the freshly persisted result into the server component (title
        // card résumé) once.
        if (!refreshedRef.current) {
          refreshedRef.current = true;
          router.refresh();
        }
      }
    }

    poll();
    pollRef.current = setInterval(poll, 1500);
    return () => {
      cancelled = true;
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [jobId, router]);

  // Live countdown between polls, so the estimate doesn't just jump every 1.5s.
  useEffect(() => {
    if (job?.status !== "RUNNING") return;
    const tick = setInterval(() => {
      setEtaMs((ms) => (ms == null ? null : Math.max(0, ms - 1000)));
    }, 1000);
    return () => clearInterval(tick);
  }, [job?.status]);

  async function startAnalysis() {
    setStarting(true);
    setStartError(null);
    try {
      const res = await fetch(`/api/videos/${videoId}/analyze`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setStartError(data.error ?? t("runner.startFailed"));
      } else {
        refreshedRef.current = false;
        etaRawRef.current = null;
        setEtaMs(null);
        setJob(null);
        setJobId(data.jobId);
      }
    } catch {
      setStartError(t("runner.networkError"));
    } finally {
      setStarting(false);
    }
  }

  if (!jobId) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-6">
        <button
          onClick={startAnalysis}
          disabled={starting}
          className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          <Play size={15} />
          {starting ? t("runner.starting") : t("runner.startAnalysis")}
        </button>
        {startError && <p className="mt-3 text-sm text-danger">{startError}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-surface p-6">
        <div className="mb-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-raised">
          <div
            className="h-full gradient-ring transition-all"
            style={{ width: `${job?.progress ?? 0}%` }}
          />
        </div>
        <p className="mb-4 min-h-[1em] text-xs text-muted">
          {job?.status === "RUNNING" && (etaMs != null ? formatEta(etaMs, t) : t("runner.etaComputing"))}
        </p>
        <ul className="space-y-2.5">
          {STAGES.map((stage) => {
            const logsForStage = job?.logs.filter((l) => l.stage === stage.key) ?? [];
            const last = logsForStage[logsForStage.length - 1];
            const isCurrent = job?.currentStage === stage.key && job.status === "RUNNING";

            let icon = <Circle size={16} className="mt-0.5 shrink-0 text-muted" />;
            if (isCurrent) icon = <Loader2 size={16} className="mt-0.5 shrink-0 animate-spin text-accent" />;
            else if (last?.status === "done") icon = <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-success" />;
            else if (last?.status === "skipped") icon = <MinusCircle size={16} className="mt-0.5 shrink-0 text-muted" />;
            else if (last?.status === "error") icon = <XCircle size={16} className="mt-0.5 shrink-0 text-danger" />;

            return (
              <li key={stage.key} className="flex items-start gap-2.5 text-sm">
                {icon}
                <div>
                  <span className={last || isCurrent ? "" : "text-muted"}>{t(stage.labelKey)}</span>
                  {last?.message && (
                    <p
                      className={
                        last.status === "error"
                          ? "text-xs text-danger"
                          : last.status === "skipped"
                            ? "text-xs text-warning"
                            : "text-xs text-muted"
                      }
                    >
                      {last.message}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        {job?.status === "FAILED" && job.error && (
          <p className="mt-4 text-sm text-danger">{t("runner.analysisFailed", { error: job.error })}</p>
        )}
        {(job?.status === "COMPLETED" || job?.status === "FAILED") && (
          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={startAnalysis}
              disabled={starting}
              className="flex items-center gap-2 rounded-lg border border-accent/60 bg-accent/10 px-3.5 py-2 text-xs font-semibold text-accent hover:bg-accent/20 disabled:opacity-50"
            >
              <RefreshCw size={13} className={starting ? "animate-spin" : ""} />
              {starting ? t("runner.restarting") : t("runner.rerun")}
            </button>
            {startError && <span className="text-xs text-danger">{startError}</span>}
          </div>
        )}
      </div>

      {(job?.status === "COMPLETED" || job?.status === "RUNNING") && (
        <p className="text-xs text-muted">
          {job.status === "RUNNING" ? t("runner.runningNote") : t("runner.detailedResultsBelow")}
        </p>
      )}
    </div>
  );
}
