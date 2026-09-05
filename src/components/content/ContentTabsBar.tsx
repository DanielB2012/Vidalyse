import Link from "next/link";
import {
  getOrUpdateChannelTypeBreakdown,
  sumMatrixByType,
  type PublishedContentType,
  type PrivacyStatus,
} from "@/lib/youtube/uploads";
import { getT } from "@/i18n/server";
import { formatCount } from "@/lib/format";

const TAB_KEYS: { key: PublishedContentType; labelKey: string }[] = [
  { key: "video", labelKey: "content.tabVideos" },
  { key: "short", labelKey: "content.tabShorts" },
  { key: "live", labelKey: "content.tabLives" },
];

function tabHref(tab: PublishedContentType, visibility: PrivacyStatus | "all") {
  return `/content?tab=${tab}${visibility === "all" ? "" : `&visibility=${visibility}`}`;
}

// Sync so it can be a Suspense fallback — labels come pre-resolved from the page.
export function TabsFallback({
  activeTab,
  activeVisibility,
  labels,
}: {
  activeTab: PublishedContentType;
  activeVisibility: PrivacyStatus | "all";
  labels: Record<PublishedContentType, string>;
}) {
  return (
    <div className="flex items-center gap-2 border-b border-border">
      {TAB_KEYS.map((t) => (
        <Link
          key={t.key}
          href={tabHref(t.key, activeVisibility)}
          className={`border-b-4 px-5 py-3 text-base font-semibold transition ${
            activeTab === t.key ? "border-accent text-foreground" : "border-transparent text-muted hover:text-foreground"
          }`}
        >
          {labels[t.key]}
          <span className="ml-2 text-sm text-muted">(…)</span>
        </Link>
      ))}
    </div>
  );
}

// Real per-type totals, filtered by the selected visibility — no official
// API for this, so it classifies every upload (capped, see uploads.ts) once
// per page load. Server-rendered separately from the page shell so it can
// stream in behind Suspense instead of blocking the whole page on a scan
// that can take a while the first time (cached after that).
export async function ContentTabsBar({
  userId,
  activeTab,
  activeVisibility,
}: {
  userId: string;
  activeTab: PublishedContentType;
  activeVisibility: PrivacyStatus | "all";
}) {
  const { t, locale } = await getT();
  const breakdown = await getOrUpdateChannelTypeBreakdown(userId);
  const counts = breakdown
    ? sumMatrixByType(breakdown.matrix, activeVisibility === "all" ? undefined : activeVisibility)
    : { video: 0, short: 0, live: 0 };
  const filteredTotal = counts.video + counts.short + counts.live;

  const visLabel =
    activeVisibility === "public"
      ? t("tabsBar.visPublic")
      : activeVisibility === "unlisted"
        ? t("tabsBar.visUnlisted")
        : t("tabsBar.visPrivate");

  return (
    <>
      <div className="flex items-center gap-2 border-b border-border">
        {TAB_KEYS.map((tab) => (
          <Link
            key={tab.key}
            href={tabHref(tab.key, activeVisibility)}
            className={`border-b-4 px-5 py-3 text-base font-semibold transition ${
              activeTab === tab.key ? "border-accent text-foreground" : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            {t(tab.labelKey)}
            <span className="ml-2 text-sm text-muted">({formatCount(counts[tab.key], locale)})</span>
          </Link>
        ))}
      </div>
      <p className="text-[11px] text-muted">
        {!breakdown
          ? t("tabsBar.totalsUnavailable")
          : activeVisibility === "all"
            ? breakdown.capped
              ? t("tabsBar.totalCapped", {
                  scanned: formatCount(breakdown.scanned, locale),
                  total: formatCount(breakdown.totalOnChannel ?? 0, locale),
                })
              : t("tabsBar.totalFull", { scanned: formatCount(breakdown.scanned, locale) })
            : t("tabsBar.filteredCount", {
                count: formatCount(filteredTotal, locale),
                visibility: visLabel,
              })}
        {breakdown &&
          activeVisibility === "all" &&
          breakdown.totalOnChannel !== null &&
          breakdown.scanned !== breakdown.totalOnChannel &&
          t("tabsBar.publicOnlyNote", { total: formatCount(breakdown.totalOnChannel, locale) })}
        {activeTab === "short" && t("tabsBar.shortsNote")}
      </p>
    </>
  );
}
