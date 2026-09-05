import { getT } from "@/i18n/server";
import { formatDuration, formatCount } from "@/lib/format";
import type { SingleVideoStats } from "@/lib/youtube/analytics";

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface-raised p-3">
      <p className="text-[11px] text-muted">{label}</p>
      <p className="mt-0.5 text-sm font-semibold">{value}</p>
    </div>
  );
}

export async function YoutubeStatsGrid({ stats }: { stats: SingleVideoStats }) {
  const { t, locale } = await getT();

  const na = t("stats.dataUnavailable");
  const formatMinutes = (min: number | null): string => {
    if (min === null) return na;
    const h = Math.floor(min / 60);
    const m = Math.round(min % 60);
    return h > 0 ? t("stats.hoursMinutes", { h, m }) : t("stats.minutesOnly", { m });
  };
  const formatPercent = (p: number | null): string =>
    p === null ? na : t("stats.percent", { p: p.toFixed(1) });

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <StatTile label={t("stats.views")} value={formatCount(stats.viewCount, locale)} />
      <StatTile label={t("stats.likes")} value={formatCount(stats.likeCount, locale)} />
      <StatTile label={t("stats.comments")} value={formatCount(stats.commentCount, locale)} />
      <StatTile label={t("stats.subsGained")} value={formatCount(stats.subscribersGained, locale)} />
      <StatTile
        label={t("stats.watchTime")}
        value={formatMinutes(stats.estimatedMinutesWatched)}
      />
      <StatTile
        label={t("stats.avgViewDuration")}
        value={
          stats.averageViewDurationSec === null
            ? na
            : formatDuration(stats.averageViewDurationSec, locale)
        }
      />
      <StatTile label={t("stats.avgPercentViewed")} value={formatPercent(stats.averageViewPercentage)} />
    </div>
  );
}
