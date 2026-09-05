import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { LyraPageContext } from "@/components/lyra/LyraPageContext";
import { VideoUploadForm } from "@/components/content/VideoUploadForm";
import { YoutubeUrlAnalyzeForm } from "@/components/content/YoutubeUrlAnalyzeForm";
import { AnalyzeContentButton } from "@/components/content/AnalyzeContentButton";
import { getT } from "@/i18n/server";
import { formatDuration } from "@/lib/format";
import { ArrowLeft, Film } from "lucide-react";

const STATUS_KEY: Record<string, string> = {
  PENDING: "content.statusPending",
  RUNNING: "content.statusRunning",
  COMPLETED: "content.statusCompleted",
  FAILED: "content.statusFailed",
};

export default async function AnalyzedContentPage() {
  const session = await auth();
  const { t, locale } = await getT();
  const videos = await prisma.video.findMany({
    where: { userId: session!.user.id, purpose: "ANALYSIS" },
    orderBy: { createdAt: "desc" },
    include: { jobs: { orderBy: { createdAt: "desc" }, take: 1 } },
  });

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <LyraPageContext description={t("content.lyraContextAnalyzed")} />

      <Link href="/content" className="flex items-center gap-1.5 text-sm text-muted hover:text-foreground">
        <ArrowLeft size={15} />
        {t("content.backToContent")}
      </Link>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("content.analyzedTitle")}</h1>
        <p className="mt-1 text-sm text-muted">{t("content.analyzedSubtitle")}</p>
        <Link
          href="/content/pre-publish"
          className="mt-2 inline-block text-xs text-accent hover:underline"
        >
          {t("content.analyzeBeforePublish1")}
          <strong>{t("content.analyzeBeforePublishStrong")}</strong>
          {t("content.analyzeBeforePublish2")}
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <VideoUploadForm />
        <YoutubeUrlAnalyzeForm />
      </div>

      <div className="space-y-3">
        {videos.length === 0 && (
          <p className="text-sm text-muted">{t("content.noImportedVideos")}</p>
        )}
        {videos.map((video) => {
          const job = video.jobs[0];
          return (
            <div key={video.id} className="rounded-xl border border-border bg-surface p-4">
              <Link href={`/content/${video.id}`} className="flex items-center gap-4">
                <div className="flex h-16 w-28 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface-raised">
                  {video.thumbnailPath ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`/api/videos/${video.id}/thumbnail`}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <Film size={20} className="text-muted" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{video.title}</p>
                  <p className="text-xs text-muted">{formatDuration(video.durationSec, locale)}</p>
                </div>
                <span className="shrink-0 rounded-full border border-border-strong px-2.5 py-1 text-xs text-muted">
                  {job ? t(STATUS_KEY[job.status] ?? job.status) : t("content.notAnalyzedYet")}
                </span>
              </Link>
              <div className="mt-3 border-t border-border pt-3">
                {job?.status === "COMPLETED" ? (
                  <Link
                    href={`/content/${video.id}`}
                    className="text-xs font-medium text-accent hover:underline"
                  >
                    {t("content.viewAnalysis")}
                  </Link>
                ) : job?.status === "RUNNING" || job?.status === "PENDING" ? (
                  <Link
                    href={`/content/${video.id}`}
                    className="text-xs font-medium text-accent hover:underline"
                  >
                    {t("content.viewProgress")}
                  </Link>
                ) : (
                  <AnalyzeContentButton videoId={video.id} label={t("content.analyze")} />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
