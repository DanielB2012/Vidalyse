"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Eye, Clock, ThumbsUp, UserPlus } from "lucide-react";
import { ViewsBarChart } from "./ViewsBarChart";
import { useT } from "@/i18n/LanguageProvider";

interface VideoPerformance {
  videoId: string;
  title: string;
  thumbnailUrl: string | null;
  views: number;
  estimatedMinutesWatched: number;
  averageViewDurationSec: number;
  averageViewPercentage: number;
  likes: number;
  comments: number;
  subscribersGained: number;
}

interface Summary {
  rangeStartDate: string;
  rangeEndDate: string;
  dailySeries: { date: string; views: number; estimatedMinutesWatched: number }[];
  topVideos: VideoPerformance[];
}

type State =
  | { status: "loading" }
  | { status: "ready"; data: Summary }
  | { status: "no_permission" }
  | { status: "error" };

export function ChannelAnalytics() {
  const { t, locale } = useT();
  const [state, setState] = useState<State>({ status: "loading" });
  const fmt = (n: number) =>
    new Intl.NumberFormat(locale === "en" ? "en-US" : "fr-FR").format(Math.round(n));

  useEffect(() => {
    let cancelled = false;
    fetch("/api/youtube/analytics")
      .then(async (res) => {
        if (cancelled) return;
        if (res.status === 404) return setState({ status: "no_permission" });
        if (!res.ok) return setState({ status: "error" });
        const data = await res.json();
        setState({ status: "ready", data });
      })
      .catch(() => !cancelled && setState({ status: "error" }));
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === "loading") {
    return <div className="rounded-2xl border border-border bg-surface p-6 text-sm text-muted">{t("analytics.loading")}</div>;
  }
  if (state.status === "no_permission") {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-6 text-sm text-muted">
        <AlertTriangle size={18} className="text-warning shrink-0" />
        {t("analytics.noPermission")}
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-6 text-sm text-muted">
        <AlertTriangle size={18} className="text-danger shrink-0" />
        {t("analytics.error")}
      </div>
    );
  }

  const { dailySeries, topVideos } = state.data;
  const totalViews = dailySeries.reduce((s, d) => s + d.views, 0);
  const totalMinutes = dailySeries.reduce((s, d) => s + d.estimatedMinutesWatched, 0);
  const totalLikes = topVideos.reduce((s, v) => s + v.likes, 0);
  const totalSubsGained = topVideos.reduce((s, v) => s + v.subscribersGained, 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile icon={Eye} label={t("analytics.tileViews")} value={fmt(totalViews)} />
        <Tile icon={Clock} label={t("analytics.tileWatchTime")} value={`${fmt(totalMinutes / 60)} ${t("analytics.hours")}`} />
        <Tile icon={ThumbsUp} label={t("analytics.tileLikes")} value={fmt(totalLikes)} />
        <Tile icon={UserPlus} label={t("analytics.tileSubsGained")} value={fmt(totalSubsGained)} />
      </div>

      <div className="rounded-2xl border border-border bg-surface p-6">
        <h2 className="mb-4 text-sm font-semibold text-muted">{t("analytics.viewsPerDay")}</h2>
        <ViewsBarChart data={dailySeries} />
      </div>

      <div className="rounded-2xl border border-border bg-surface p-6">
        <h2 className="mb-4 text-sm font-semibold text-muted">{t("analytics.topVideos")}</h2>
        {topVideos.length === 0 ? (
          <p className="text-sm text-muted">{t("analytics.noDataPeriod")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="text-xs text-muted">
                <tr>
                  <th className="pb-2 text-left">{t("analytics.thVideo")}</th>
                  <th className="pb-2 text-right">{t("analytics.thViews")}</th>
                  <th className="pb-2 text-right">{t("analytics.thAvgDuration")}</th>
                  <th className="pb-2 text-right">{t("analytics.thAvgPercent")}</th>
                  <th className="pb-2 text-right">{t("analytics.thLikes")}</th>
                  <th className="pb-2 text-right">{t("analytics.thSubs")}</th>
                </tr>
              </thead>
              <tbody>
                {topVideos.map((v) => (
                  <tr key={v.videoId} className="border-t border-border">
                    <td className="max-w-xs truncate py-2 pr-4">{v.title}</td>
                    <td className="py-2 text-right">{fmt(v.views)}</td>
                    <td className="py-2 text-right">{Math.round(v.averageViewDurationSec)}s</td>
                    <td className="py-2 text-right">{v.averageViewPercentage.toFixed(0)}%</td>
                    <td className="py-2 text-right">{fmt(v.likes)}</td>
                    <td className="py-2 text-right">{fmt(v.subscribersGained)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Tile({ icon: Icon, label, value }: { icon: typeof Eye; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <Icon size={16} className="mb-2 text-accent" />
      <p className="text-lg font-semibold">{value}</p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  );
}
