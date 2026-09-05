"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { VideoPlayer } from "../VideoPlayer";
import { SeekProvider } from "./seek-context";
import { Timeline } from "./Timeline";
import {
  AudioPanel,
  ComparisonPanel,
  HighlightsPanel,
  HookPanel,
  OverviewPanel,
  StructurePanel,
  TranscriptPanel,
  VisionPanel,
  YouTubePanel,
} from "./panels";
import { ShortsPanel } from "./ShortsPanel";
import { PrePublishPanel } from "./PrePublishPanel";
import { EmptyNote } from "./primitives";
import { useT } from "@/i18n/LanguageProvider";
import type { MergedAnalysis } from "@/lib/pipeline/types";

type TabKey =
  | "overview"
  | "timeline"
  | "highlights"
  | "structure"
  | "vision"
  | "audio"
  | "transcript"
  | "youtube"
  | "shorts"
  | "prepublish";

export function AnalysisWorkspace({
  videoId,
  hasFile,
  hasThumbnail,
  result,
  linkedYoutube,
  prePublish = false,
  plannedTitle = null,
}: {
  videoId: string;
  hasFile: boolean;
  hasThumbnail: boolean;
  result: MergedAnalysis;
  linkedYoutube: boolean;
  prePublish?: boolean;
  plannedTitle?: string | null;
}) {
  const { t } = useT();
  const videoElRef = useRef<HTMLVideoElement | null>(null);
  const [tab, setTab] = useState<TabKey>(prePublish ? "prepublish" : "overview");

  const seekTo = useCallback(
    (ms: number) => {
      const el = videoElRef.current;
      if (!el) return;
      el.currentTime = Math.max(0, ms / 1000);
      el.play().catch(() => {});
      el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    },
    []
  );

  const enriched = result.enriched ?? null;
  const durationMs = Math.round((result.video.durationSec || 0) * 1000);
  const transcriptReliable =
    result.transcriptSource === "author_subtitles_embedded" ||
    result.transcriptSource === "author_subtitles_sidecar" ||
    result.transcriptSource === "whisper_local";

  const tabs = useMemo(() => {
    const base: { key: TabKey; labelKey: string }[] = [
      { key: "overview", labelKey: "analysis.tabOverview" },
      { key: "timeline", labelKey: "analysis.tabTimeline" },
      { key: "highlights", labelKey: "analysis.tabHighlights" },
      { key: "structure", labelKey: "analysis.tabStructureHook" },
      { key: "vision", labelKey: "analysis.tabVision" },
      { key: "audio", labelKey: "analysis.tabAudio" },
      { key: "transcript", labelKey: "analysis.tabTranscript" },
      { key: "youtube", labelKey: "analysis.tabYouTube" },
      { key: "shorts", labelKey: "analysis.tabShorts" },
    ];
    if (!linkedYoutube || prePublish) base.push({ key: "prepublish", labelKey: "analysis.tabPrePublish" });
    return base;
  }, [linkedYoutube, prePublish]);

  return (
    <SeekProvider value={{ seekTo: hasFile ? seekTo : null }}>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        <div className="lg:sticky lg:top-4 lg:self-start">
          {hasFile ? (
            <VideoPlayer
              videoId={videoId}
              hasThumbnail={hasThumbnail}
              onReady={(el) => {
                videoElRef.current = el;
              }}
              className="w-full rounded-2xl border border-border bg-black"
            />
          ) : (
            <EmptyNote>{t("analysis.noLocalFile")}</EmptyNote>
          )}
        </div>

        <div className="min-w-0 space-y-4">
          <div className="-mx-1 flex gap-1 overflow-x-auto pb-1">
            {tabs.map((tabItem) => (
              <button
                key={tabItem.key}
                onClick={() => setTab(tabItem.key)}
                className={clsx(
                  "shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition",
                  tab === tabItem.key
                    ? "bg-surface-raised text-foreground border border-border-strong"
                    : "text-muted hover:text-foreground border border-transparent"
                )}
              >
                {t(tabItem.labelKey)}
              </button>
            ))}
          </div>

          {tab === "overview" && (
            <div className="space-y-4">
              <OverviewPanel
                summary={result.summary}
                cross={enriched?.cross ?? null}
                textSynthesis={result.textSynthesis}
              />
              <ComparisonPanel data={enriched?.comparison ?? null} videoId={videoId} />
            </div>
          )}

          {tab === "timeline" && <Timeline events={enriched?.timeline ?? []} durationMs={durationMs} />}

          {tab === "highlights" && <HighlightsPanel data={enriched?.highlights ?? null} />}

          {tab === "structure" && (
            <div className="space-y-4">
              <StructurePanel data={enriched?.structure ?? null} />
              <HookPanel data={enriched?.hook ?? null} />
            </div>
          )}

          {tab === "vision" && (
            <VisionPanel events={result.visionEvents} scene={enriched?.sceneDetection ?? null} />
          )}

          {tab === "audio" && <AudioPanel audio={result.audioDsp} durationSec={result.video.durationSec} />}

          {tab === "transcript" && (
            <TranscriptPanel segments={result.transcript} source={result.transcriptSource ?? null} />
          )}

          {tab === "youtube" && <YouTubePanel stats={result.youtubeStats} linked={linkedYoutube} />}

          {tab === "shorts" && (
            <ShortsPanel videoId={videoId} hasResult transcriptReliable={transcriptReliable} />
          )}

          {tab === "prepublish" && (
            <PrePublishPanel videoId={videoId} defaultTitle={plannedTitle} />
          )}
        </div>
      </div>
    </SeekProvider>
  );
}
