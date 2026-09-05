import Link from "next/link";
import { auth } from "@/auth";
import { getT } from "@/i18n/server";
import { LyraPageContext } from "@/components/lyra/LyraPageContext";
import { getMyPublicProfile } from "@/lib/community/profile";
import { getCommunityHome } from "@/lib/community/home";
import { maybeSyncYoutubePublications } from "@/lib/community/youtubeSync";
import { CommunitySearchBar } from "@/components/community/CommunitySearchBar";
import { VideoCard } from "@/components/community/VideoCard";
import { ArrowRight } from "lucide-react";

export default async function CommunityPage() {
  const session = await auth();
  const userId = session!.user.id;
  const { t, locale } = await getT();

  await maybeSyncYoutubePublications(userId);

  const [profile, items] = await Promise.all([
    getMyPublicProfile(userId),
    getCommunityHome(userId, { regionCode: locale === "en" ? "US" : "FR" }),
  ]);

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <LyraPageContext description={t("community.lyraContext")} />

      <CommunitySearchBar />

      {!profile && (
        <Link
          href="/profile"
          className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-border-strong bg-surface/50 px-4 py-2.5 text-sm text-muted hover:text-foreground"
        >
          {t("community.noProfileYet")}
          <ArrowRight size={14} className="shrink-0" />
        </Link>
      )}

      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border-strong bg-surface/50 p-12 text-center text-sm text-muted">
          {t("communityFeed.empty")}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((it) =>
            it.kind === "community" ? (
              <VideoCard
                key={it.key}
                publicId={it.publicId!}
                title={it.title}
                thumbnailUrl={it.thumbnailUrl}
                creatorHandle={it.creatorHandle ?? ""}
                creatorName={it.creatorName}
                like={{ liked: it.likedByViewer ?? false, count: it.likeCount ?? 0 }}
              />
            ) : (
              <VideoCard
                key={it.key}
                href={`/community/yt/${it.youtubeVideoId}`}
                publicId={it.youtubeVideoId!}
                title={it.title}
                thumbnailUrl={it.thumbnailUrl}
                creatorHandle={it.creatorHandle ?? ""}
                creatorName={it.creatorName}
                disableCreatorLink={!it.creatorHandle}
                youtubeLike={{
                  youtubeVideoId: it.youtubeVideoId!,
                  channelId: it.channelId ?? "",
                  title: it.title,
                }}
              />
            )
          )}
        </div>
      )}
    </div>
  );
}
