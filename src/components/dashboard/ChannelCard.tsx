"use client";

import { useEffect, useState } from "react";
import { Users, Video, Eye, AlertTriangle } from "lucide-react";
import { useT } from "@/i18n/LanguageProvider";

interface ChannelData {
  title: string;
  thumbnailUrl: string | null;
  subscriberCount: number | null;
  videoCount: number | null;
  viewCount: string | null;
}

type State =
  | { status: "loading" }
  | { status: "ready"; channel: ChannelData }
  | { status: "no_permission" }
  | { status: "error" };

export function ChannelCard() {
  const { t, locale } = useT();
  const [state, setState] = useState<State>({ status: "loading" });

  const formatCount = (n: number | null) => {
    if (n === null) return t("channelCard.dataUnavailable");
    return new Intl.NumberFormat(locale === "en" ? "en-US" : "fr-FR").format(n);
  };

  useEffect(() => {
    let cancelled = false;
    fetch("/api/youtube/channel")
      .then(async (res) => {
        if (cancelled) return;
        if (res.status === 404) return setState({ status: "no_permission" });
        if (!res.ok) return setState({ status: "error" });
        const channel = await res.json();
        setState({ status: "ready", channel });
      })
      .catch(() => !cancelled && setState({ status: "error" }));
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === "loading") {
    return (
      <div className="rounded-2xl border border-border bg-surface p-6 text-sm text-muted">
        {t("channelCard.loading")}
      </div>
    );
  }

  if (state.status === "no_permission") {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-6 text-sm text-muted">
        <AlertTriangle size={18} className="text-warning shrink-0" />
        {t("channelCard.noPermission")}
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-6 text-sm text-muted">
        <AlertTriangle size={18} className="text-danger shrink-0" />
        {t("channelCard.error")}
      </div>
    );
  }

  const { channel } = state;

  return (
    <div className="rounded-2xl border border-border bg-surface p-6">
      <div className="flex items-center gap-4">
        {channel.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={channel.thumbnailUrl} alt="" className="h-14 w-14 rounded-full" />
        ) : (
          <div className="h-14 w-14 rounded-full bg-surface-raised" />
        )}
        <div>
          <p className="text-lg font-semibold">{channel.title}</p>
          <p className="text-xs text-muted">{t("channelCard.connected")}</p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-3 gap-4">
        <Stat icon={Users} label={t("channelCard.subscribers")} value={formatCount(channel.subscriberCount)} />
        <Stat icon={Video} label={t("channelCard.videos")} value={formatCount(channel.videoCount)} />
        <Stat
          icon={Eye}
          label={t("channelCard.totalViews")}
          value={
            channel.viewCount
              ? formatCount(Number(channel.viewCount))
              : t("channelCard.dataUnavailable")
          }
        />
      </div>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Users;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface-raised/60 p-4">
      <Icon size={16} className="mb-2 text-accent" />
      <p className="text-lg font-semibold">{value}</p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  );
}
