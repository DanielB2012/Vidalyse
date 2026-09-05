import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { LyraPageContext } from "@/components/lyra/LyraPageContext";
import { YoutubeStatsGrid } from "@/components/content/YoutubeStatsGrid";
import { DailyLineChart } from "@/components/content/DailyLineChart";
import { VideoCommentsList } from "@/components/content/VideoCommentsList";
import { AnalyzeContentButton } from "@/components/content/AnalyzeContentButton";
import { fetchSingleVideoStats, fetchSingleVideoDailySeries } from "@/lib/youtube/analytics";
import { fetchVideoComments } from "@/lib/youtube/comments";
import { getT } from "@/i18n/server";
import { formatDuration, formatDate, formatCount } from "@/lib/format";
import { ArrowLeft, ExternalLink } from "lucide-react";

export default async function PublishedVideoProfilePage({
  params,
}: {
  params: Promise<{ videoId: string }>;
}) {
  const session = await auth();
  const userId = session!.user.id;
  const { t, locale } = await getT();
  const { videoId } = await params;

  const account = await prisma.account.findFirst({ where: { userId, provider: "google" } });
  if (!account) notFound();

  const stats = await fetchSingleVideoStats(userId, videoId);
  if (!stats) notFound();

  const [dailySeries, comments, localVideo] = await Promise.all([
    fetchSingleVideoDailySeries(userId, videoId, stats.publishedAt),
    fetchVideoComments(userId, videoId),
    prisma.video.findFirst({ where: { userId, youtubeVideoId: videoId }, select: { id: true, storagePath: true } }),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <LyraPageContext
        description={t("video.lyraContextPublished", { title: stats.title })}
      />

      <Link href="/content" className="flex items-center gap-1.5 text-sm text-muted hover:text-foreground">
        <ArrowLeft size={15} />
        {t("video.backToContent")}
      </Link>

      <div className="aspect-video w-full overflow-hidden rounded-2xl border border-border bg-black">
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${videoId}`}
          title={stats.title}
          className="h-full w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>

      <div className="space-y-4 rounded-2xl border border-border bg-surface p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold">{stats.title}</h1>
            <p className="text-xs text-muted">
              {t("video.publishedOn", {
                date: formatDate(stats.publishedAt, locale),
                duration: formatDuration(stats.durationSec, locale),
              })}
            </p>
          </div>
          <a
            href={`https://www.youtube.com/watch?v=${videoId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border-strong px-3 py-1.5 text-xs text-muted hover:border-accent/60 hover:text-foreground"
          >
            <ExternalLink size={12} />
            {t("video.viewOnYoutube")}
          </a>
        </div>
        {localVideo?.storagePath ? (
          <AnalyzeContentButton videoId={localVideo.id} size="lg" />
        ) : (
          <AnalyzeContentButton youtubeVideoId={videoId} title={stats.title} size="lg" />
        )}
      </div>

      <div className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="mb-3 text-sm font-semibold text-muted">{t("video.statsHeading")}</h2>
        <YoutubeStatsGrid stats={stats} />
      </div>

      <div className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="mb-3 text-sm font-semibold text-muted">{t("video.evolutionHeading")}</h2>
        {dailySeries === null ? (
          <p className="text-sm text-muted">{t("video.evolutionUnavailable")}</p>
        ) : dailySeries.length === 0 ? (
          <p className="text-sm text-muted">{t("video.noDailyData")}</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <DailyLineChart
              title={t("video.viewsPerDay")}
              data={dailySeries.map((d) => ({ date: d.date, value: d.views }))}
              color="var(--accent)"
            />
            <DailyLineChart
              title={t("video.minutesPerDay")}
              data={dailySeries.map((d) => ({ date: d.date, value: d.estimatedMinutesWatched }))}
              color="var(--accent-2)"
            />
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="mb-3 text-sm font-semibold text-muted">
          {t("video.commentsHeading")}{" "}
          {stats.commentCount !== null && `(${formatCount(stats.commentCount, locale)})`}
        </h2>
        <VideoCommentsList result={comments} />
      </div>
    </div>
  );
}
