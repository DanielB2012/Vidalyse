import Link from "next/link";
import { Suspense } from "react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { LyraPageContext } from "@/components/lyra/LyraPageContext";
import { fetchPublishedVideos, type PublishedContentType, type PrivacyStatus } from "@/lib/youtube/uploads";
import { fetchOwnChannel } from "@/lib/youtube/client";
import { ContentTabsBar, TabsFallback } from "@/components/content/ContentTabsBar";
import { AnalyzeContentButton } from "@/components/content/AnalyzeContentButton";
import { getT } from "@/i18n/server";
import { formatDuration, formatCount, formatDate } from "@/lib/format";
import { ExternalLink } from "lucide-react";

const TABS: { key: PublishedContentType; labelKey: string }[] = [
  { key: "video", labelKey: "content.tabVideos" },
  { key: "short", labelKey: "content.tabShorts" },
  { key: "live", labelKey: "content.tabLives" },
];

const VISIBILITY_OPTIONS: { key: PrivacyStatus | "all"; labelKey: string }[] = [
  { key: "all", labelKey: "content.visAll" },
  { key: "public", labelKey: "content.visPublic" },
  { key: "unlisted", labelKey: "content.visUnlisted" },
  { key: "private", labelKey: "content.visPrivate" },
];

export default async function ContentPage({
  searchParams,
}: {
  searchParams: Promise<{ pageToken?: string; tab?: string; visibility?: string }>;
}) {
  const session = await auth();
  const userId = session!.user.id;
  const { t, locale } = await getT();
  const { pageToken, tab, visibility } = await searchParams;
  const activeTab: PublishedContentType = TABS.some((t) => t.key === tab) ? (tab as PublishedContentType) : "video";
  const activeVisibility: PrivacyStatus | "all" = VISIBILITY_OPTIONS.some((v) => v.key === visibility)
    ? (visibility as PrivacyStatus | "all")
    : "all";

  const account = await prisma.account.findFirst({ where: { userId, provider: "google" } });
  const [page, channel] = account
    ? await Promise.all([fetchPublishedVideos(userId, pageToken), fetchOwnChannel(userId)])
    : [null, null];
  const videos =
    page?.videos.filter(
      (v) => v.contentType === activeTab && (activeVisibility === "all" || v.privacyStatus === activeVisibility)
    ) ?? [];

  // A published video can only be really analyzed (pipeline needs the raw
  // file) if it's already linked to a local import with a file on disk —
  // that link is made from the video's own page (LinkYoutubeVideoForm).
  const linkedLocalVideos =
    videos.length > 0
      ? await prisma.video.findMany({
          where: { userId, youtubeVideoId: { in: videos.map((v) => v.videoId) } },
          select: { id: true, youtubeVideoId: true, storagePath: true },
        })
      : [];
  const localVideoByYoutubeId = new Map(linkedLocalVideos.map((lv) => [lv.youtubeVideoId!, lv]));

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <LyraPageContext description={t("content.lyraContext")} />

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("content.title")}</h1>
          <p className="mt-1 text-sm text-muted">
            {t("content.subtitle")}
            {channel?.videoCount !== null && channel?.videoCount !== undefined && (
              <>{t("content.totalVideosSuffix", { count: formatCount(channel.videoCount, locale) })}</>
            )}
          </p>
        </div>
        <Link
          href="/content/analyzed"
          className="shrink-0 rounded-lg border border-border-strong px-3 py-1.5 text-xs text-muted hover:border-accent/60 hover:text-foreground"
        >
          {t("content.seeAnalyzed")}
        </Link>
      </div>

      {!account ? (
        <p className="rounded-2xl border border-dashed border-border-strong bg-surface/50 p-6 text-center text-sm text-muted">
          {t("content.connectGoogle1")}
          <Link href="/settings" className="text-accent hover:underline">
            {t("content.settingsLink")}
          </Link>
          {t("content.connectGoogle2")}
        </p>
      ) : !page ? (
        <p className="rounded-2xl border border-dashed border-border-strong bg-surface/50 p-6 text-center text-sm text-muted">
          {t("content.fetchChannelFailed")}
        </p>
      ) : (
        <>
          <Suspense
            fallback={
              <TabsFallback
                activeTab={activeTab}
                activeVisibility={activeVisibility}
                labels={{
                  video: t("content.tabVideos"),
                  short: t("content.tabShorts"),
                  live: t("content.tabLives"),
                }}
              />
            }
          >
            <ContentTabsBar userId={userId} activeTab={activeTab} activeVisibility={activeVisibility} />
          </Suspense>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted">{t("content.visibility")}</span>
            {VISIBILITY_OPTIONS.map((v) => (
              <Link
                key={v.key}
                href={`/content?tab=${activeTab}${v.key === "all" ? "" : `&visibility=${v.key}`}`}
                className={`rounded-full border px-2.5 py-1 text-xs transition ${
                  activeVisibility === v.key
                    ? "border-accent/60 bg-accent/15 text-accent"
                    : "border-border-strong text-muted hover:border-accent/40"
                }`}
              >
                {t(v.labelKey)}
              </Link>
            ))}
          </div>

          {videos.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border-strong bg-surface/50 p-6 text-center text-sm text-muted">
              {t("content.emptyCategory")}
            </p>
          ) : (
            <>
            <div className="overflow-x-auto rounded-2xl border border-border">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="bg-surface-raised text-xs text-muted">
                  <tr>
                    <th className="px-3 py-2 text-left">{t("content.thVideo")}</th>
                    <th className="whitespace-nowrap px-3 py-2 text-left">{t("content.thDate")}</th>
                    <th className="whitespace-nowrap px-3 py-2 text-left">{t("content.thDuration")}</th>
                    <th className="whitespace-nowrap px-3 py-2 text-right">{t("content.thViews")}</th>
                    <th className="whitespace-nowrap px-3 py-2 text-right">{t("content.thComments")}</th>
                    <th className="whitespace-nowrap px-3 py-2 text-right">{t("content.thLikes")}</th>
                    <th className="w-px whitespace-nowrap px-3 py-2 pr-4 text-right">{t("content.thAction")}</th>
                  </tr>
                </thead>
                <tbody>
                  {videos.map((v) => {
                    const localVideo = localVideoByYoutubeId.get(v.videoId);
                    return (
                      <tr key={v.videoId} className="border-t border-border hover:bg-surface-raised/50">
                        <td className="px-3 py-2">
                          <Link href={`/content/published/${v.videoId}`} className="flex items-center gap-3">
                            <div className="flex h-10 w-16 shrink-0 items-center justify-center overflow-hidden rounded bg-surface-raised">
                              {v.thumbnailUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={v.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                              ) : (
                                <ExternalLink size={14} className="text-muted" />
                              )}
                            </div>
                            <span className="block max-w-[180px] truncate text-foreground hover:underline">
                              {v.title}
                            </span>
                          </Link>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-muted">{formatDate(v.publishedAt, locale)}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-muted">{formatDuration(v.durationSec, locale)}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-right text-muted">{formatCount(v.viewCount, locale)}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-right text-muted">{formatCount(v.commentCount, locale)}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-right text-muted">{formatCount(v.likeCount, locale)}</td>
                        <td className="w-px whitespace-nowrap px-3 py-2 pr-4 text-right">
                          {localVideo?.storagePath ? (
                            <AnalyzeContentButton videoId={localVideo.id} label={t("content.analyze")} />
                          ) : (
                            <AnalyzeContentButton
                              youtubeVideoId={v.videoId}
                              title={v.title}
                              label={t("content.analyze")}
                            />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-1.5 text-[11px] text-muted sm:hidden">{t("content.scrollHint")}</p>
            </>
          )}

          <div className="flex justify-between">
            {page.prevPageToken ? (
              <Link
                href={`/content?tab=${activeTab}&pageToken=${page.prevPageToken}${activeVisibility === "all" ? "" : `&visibility=${activeVisibility}`}`}
                className="rounded-lg border border-border-strong px-3 py-1.5 text-xs hover:border-accent/60"
              >
                {t("content.prev")}
              </Link>
            ) : (
              <span />
            )}
            {page.nextPageToken && (
              <Link
                href={`/content?tab=${activeTab}&pageToken=${page.nextPageToken}${activeVisibility === "all" ? "" : `&visibility=${activeVisibility}`}`}
                className="rounded-lg border border-border-strong px-3 py-1.5 text-xs hover:border-accent/60"
              >
                {t("content.next")}
              </Link>
            )}
          </div>
        </>
      )}
    </div>
  );
}
