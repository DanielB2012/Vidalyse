"use client";

import { useState, useTransition } from "react";
import { Loader2, Users2 } from "lucide-react";
import { loadFeedPageAction } from "@/app/(app)/community/actions";
import type { FeedItem } from "@/lib/community/feed";
import { useT } from "@/i18n/LanguageProvider";
import { VideoCard } from "./VideoCard";

interface Props {
  initialItems: FeedItem[];
  initialCursor: string | null;
}

export function CommunityFeed({ initialItems, initialCursor }: Props) {
  const { t, locale } = useT();
  const [items, setItems] = useState<FeedItem[]>(initialItems);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const dateFmt = new Intl.DateTimeFormat(locale === "en" ? "en-US" : "fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  function loadMore() {
    setError(null);
    startTransition(async () => {
      try {
        const page = await loadFeedPageAction(cursor);
        setItems((prev) => {
          const seen = new Set(prev.map((i) => i.publicId));
          return [...prev, ...page.items.filter((i) => !seen.has(i.publicId))];
        });
        setCursor(page.nextCursor);
      } catch {
        setError(t("communityFeed.loadError"));
      }
    });
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border-strong bg-surface/50 p-12 text-center">
        <Users2 size={26} className="text-muted" />
        <p className="text-sm text-muted">{t("communityFeed.empty")}</p>
      </div>
    );
  }

  return (
    <div>
      <div className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <VideoCard
            key={item.publicId}
            publicId={item.publicId}
            title={item.title}
            thumbnailUrl={item.thumbnailUrl}
            creatorHandle={item.creator.handle}
            creatorName={item.creator.displayName}
            creatorAvatarUrl={item.creator.avatarUrl}
            metaLine={dateFmt.format(new Date(item.publishedAt))}
            like={{ liked: item.likedByViewer, count: item.likeCount }}
          />
        ))}
      </div>

      {error && <p className="mt-4 text-center text-xs text-danger">{error}</p>}

      {cursor && (
        <div className="mt-6 text-center">
          <button
            onClick={loadMore}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border-strong px-4 py-2 text-sm font-medium hover:bg-surface-raised disabled:opacity-50"
          >
            {pending && <Loader2 size={14} className="animate-spin" />}
            {pending ? t("communityFeed.loading") : t("communityFeed.loadMore")}
          </button>
        </div>
      )}
    </div>
  );
}
