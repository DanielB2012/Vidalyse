import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { LyraPageContext } from "@/components/lyra/LyraPageContext";
import { AnalysisRunner } from "@/components/content/AnalysisRunner";
import { AnalysisWorkspace } from "@/components/content/analysis/AnalysisWorkspace";
import { VideoChat } from "@/components/content/VideoChat";
import { Markdown } from "@/components/ui/Markdown";
import { LinkYoutubeVideoForm } from "@/components/content/LinkYoutubeVideoForm";
import { YoutubeStatsGrid } from "@/components/content/YoutubeStatsGrid";
import { fetchSingleVideoStats } from "@/lib/youtube/analytics";
import { getPublicationForVideo } from "@/lib/community/publish";
import { getMyPublicProfile } from "@/lib/community/profile";
import { PublishToCommunityButton } from "@/components/community/PublishToCommunityButton";
import { SOCIAL_ENABLED } from "@/lib/features";
import type { MergedAnalysis } from "@/lib/pipeline/types";
import { getT } from "@/i18n/server";
import { formatDuration } from "@/lib/format";
import { ArrowLeft, Sparkles } from "lucide-react";

export default async function VideoAnalysisPage({
  params,
}: {
  params: Promise<{ videoId: string }>;
}) {
  const session = await auth();
  const userId = session!.user.id;
  const { t, locale } = await getT();
  const { videoId } = await params;

  const [video, account, publication, communityProfile] = await Promise.all([
    prisma.video.findUnique({
      where: { id: videoId },
      include: { jobs: { orderBy: { createdAt: "desc" }, take: 1 } },
    }),
    prisma.account.findFirst({ where: { userId, provider: "google" } }),
    getPublicationForVideo(userId, videoId),
    getMyPublicProfile(userId),
  ]);

  if (!video || video.userId !== userId) notFound();

  const stats = video.youtubeVideoId ? await fetchSingleVideoStats(userId, video.youtubeVideoId) : null;

  const latestJob = video.jobs[0];
  const result =
    latestJob?.status === "COMPLETED" ? (latestJob.result as unknown as MergedAnalysis | null) : null;
  const aiSummary = result?.summary?.trim() || null;

  const analysisContext = result
    ? [
        t("video.ctxVideoLine", {
          title: video.title ?? t("video.untitled"),
          duration: formatDuration(video.durationSec, locale),
        }),
        aiSummary ? t("video.ctxSummary", { summary: aiSummary }) : null,
        result.transcript?.length
          ? `${t("video.ctxTranscript")}\n${result.transcript.map((seg) => seg.text).join(" ")}`
          : t("video.ctxTranscriptUnavailable"),
        result.textSynthesis
          ? `${t("video.ctxDetailedSynthesis")}\n${result.textSynthesis}`
          : null,
      ]
        .filter(Boolean)
        .join("\n\n")
    : null;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <LyraPageContext
        description={t("video.lyraContext", {
          title: video.title ?? t("video.untitled"),
          duration: formatDuration(video.durationSec, locale),
        })}
      />

      <Link
        href="/content/analyzed"
        className="flex items-center gap-1.5 text-sm text-muted hover:text-foreground"
      >
        <ArrowLeft size={15} />
        {t("video.backToAnalyzed")}
      </Link>

      <div className="rounded-2xl border border-border bg-surface p-5">
        <h1 className="text-lg font-semibold">{video.title}</h1>
        <p className="text-xs text-muted">
          {t("video.duration", { duration: formatDuration(video.durationSec, locale) })}
          {video.width && video.height ? ` · ${video.width}×${video.height}` : ""}
        </p>
        {aiSummary && (
          <div className="mt-3 rounded-xl border border-accent/30 bg-accent/5 p-3">
            <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-accent">
              <Sparkles size={12} />
              {t("video.aiSummary")}
            </p>
            <Markdown className="text-sm">{aiSummary}</Markdown>
          </div>
        )}
        {analysisContext && <VideoChat context={analysisContext} title={video.title} />}
      </div>

      <div className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="mb-3 text-sm font-semibold text-muted">{t("video.youtubeLinkStats")}</h2>
        {!account ? (
          <p className="text-sm text-muted">
            {t("video.connectToLink1")}
            <Link href="/settings" className="text-accent hover:underline">
              {t("content.settingsLink")}
            </Link>
            {t("video.connectToLink2")}
          </p>
        ) : (
          <>
            {video.youtubeVideoId && stats && <YoutubeStatsGrid stats={stats} />}
            {video.youtubeVideoId && !stats && (
              <p className="mb-3 text-sm text-danger">{t("video.statsFetchFailed")}</p>
            )}
            <div className={video.youtubeVideoId ? "mt-3" : ""}>
              <LinkYoutubeVideoForm videoId={video.id} linked={Boolean(video.youtubeVideoId)} />
            </div>
          </>
        )}
      </div>

      <AnalysisRunner videoId={video.id} initialJobId={video.jobs[0]?.id ?? null} />

      {SOCIAL_ENABLED && (
        <PublishToCommunityButton
          videoId={video.id}
          initialPublicId={publication?.publicId ?? null}
          canPublish={Boolean(result)}
          profileHandle={communityProfile?.handle ?? null}
          profilePublic={communityProfile?.isPublic ?? false}
        />
      )}

      {result && (
        <AnalysisWorkspace
          videoId={video.id}
          hasFile={Boolean(video.storagePath)}
          hasThumbnail={Boolean(video.thumbnailPath)}
          result={result}
          linkedYoutube={Boolean(video.youtubeVideoId)}
          prePublish={video.purpose === "PRE_PUBLISH"}
          plannedTitle={video.plannedTitle}
        />
      )}
    </div>
  );
}
