import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { LyraPageContext } from "@/components/lyra/LyraPageContext";
import { PrePublishUploadForm } from "@/components/content/PrePublishUploadForm";
import { getT } from "@/i18n/server";
import { formatDuration } from "@/lib/format";
import { ArrowLeft, Film } from "lucide-react";

const STATUS_KEY: Record<string, string> = {
  PENDING: "content.statusPending",
  RUNNING: "content.statusRunning",
  COMPLETED: "content.statusCompleted",
  FAILED: "content.statusFailed",
};

export default async function PrePublishPage() {
  const session = await auth();
  const { t, locale } = await getT();
  const videos = await prisma.video.findMany({
    where: { userId: session!.user.id, purpose: "PRE_PUBLISH" },
    orderBy: { createdAt: "desc" },
    include: { jobs: { orderBy: { createdAt: "desc" }, take: 1 } },
  });

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <LyraPageContext description={t("content.lyraContextPrePublish")} />

      <Link href="/content/analyzed" className="flex items-center gap-1.5 text-sm text-muted hover:text-foreground">
        <ArrowLeft size={15} />
        {t("content.backToAnalyzed")}
      </Link>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("content.prePublishTitle")}</h1>
        <p className="mt-1 text-sm text-muted">
          {t("content.prePublishSubtitle1")}
          <strong>{t("content.prePublishSubtitleStrong")}</strong>
          {t("content.prePublishSubtitle2")}
        </p>
      </div>

      <PrePublishUploadForm />

      <div className="space-y-3">
        {videos.length === 0 && (
          <p className="text-sm text-muted">{t("content.noPrePublish")}</p>
        )}
        {videos.map((video) => {
          const job = video.jobs[0];
          return (
            <Link
              key={video.id}
              href={`/content/${video.id}`}
              className="flex items-center gap-4 rounded-xl border border-border bg-surface p-4"
            >
              <div className="flex h-14 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface-raised">
                {video.thumbnailPath ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/videos/${video.id}/thumbnail`} alt="" className="h-full w-full object-cover" />
                ) : (
                  <Film size={18} className="text-muted" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{video.plannedTitle || video.title}</p>
                <p className="text-xs text-muted">{formatDuration(video.durationSec, locale)}</p>
              </div>
              <span className="shrink-0 rounded-full border border-border-strong px-2.5 py-1 text-xs text-muted">
                {job ? t(STATUS_KEY[job.status] ?? job.status) : t("content.notAnalyzedYet")}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
