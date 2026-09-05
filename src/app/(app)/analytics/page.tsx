import { getT } from "@/i18n/server";
import { LyraPageContext } from "@/components/lyra/LyraPageContext";
import { ChannelCard } from "@/components/dashboard/ChannelCard";
import { ChannelAnalytics } from "@/components/analytics/ChannelAnalytics";

export default async function AnalyticsPage() {
  const { t } = await getT();

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <LyraPageContext description={t("analytics.lyraContext")} />

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("analytics.title")}</h1>
        <p className="mt-1 text-sm text-muted">{t("analytics.subtitle")}</p>
      </div>

      <ChannelCard />
      <ChannelAnalytics />

      <div className="rounded-2xl border border-dashed border-border-strong bg-surface/50 p-6 text-sm text-muted">
        {t("analytics.notAvailable1")}
        <strong className="text-foreground">{t("analytics.notAvailableStrong")}</strong>
        {t("analytics.notAvailable2")}
      </div>
    </div>
  );
}
