import { prisma } from "@/lib/prisma";
import { listCommunityFeed } from "./feed";
import { followedChannelIds } from "./channelFollow";
import { fetchTrending } from "@/lib/youtube/trending";

// The /community home: fresh YouTube recommendations ("what's popular now")
// mixed with community videos. When a trending video's channel belongs to a
// Vidalyse creator (public profile), it's boosted to the front — "given two
// videos, show the one by someone who's on Vidalyse".

export interface HomeItem {
  key: string;
  kind: "community" | "youtube";
  title: string;
  thumbnailUrl: string | null;
  creatorName: string | null;
  /** Set when the creator has a public Vidalyse profile. */
  creatorHandle: string | null;
  fromVidalyseCreator: boolean;
  /** The viewer subscribes to this channel (Vidalyse channel-follow). */
  followedByViewer?: boolean;
  // community only
  publicId?: string;
  likedByViewer?: boolean;
  likeCount?: number;
  // youtube only
  youtubeVideoId?: string;
  channelId?: string;
}

export async function getCommunityHome(
  viewerId: string,
  opts: { regionCode?: string } = {}
): Promise<HomeItem[]> {
  const [feed, trending, followedChannels] = await Promise.all([
    listCommunityFeed({ viewerId, cursor: null, pageSize: 18 }),
    fetchTrending(viewerId, { regionCode: opts.regionCode, max: 40 }),
    followedChannelIds(viewerId),
  ]);

  // Which trending channels are Vidalyse creators?
  const channelIds = [...new Set(trending.map((v) => v.channelId).filter(Boolean))];
  const vidalyseByChannel = new Map<string, string>();
  if (channelIds.length) {
    const rows = await prisma.channel.findMany({
      where: { youtubeId: { in: channelIds }, user: { publicProfile: { isPublic: true } } },
      select: { youtubeId: true, user: { select: { publicProfile: { select: { handle: true } } } } },
    });
    for (const r of rows) {
      if (r.user.publicProfile?.handle) vidalyseByChannel.set(r.youtubeId, r.user.publicProfile.handle);
    }
  }

  // Videos already surfaced from the community feed — don't show the trending copy.
  const feedYtIds = new Set(feed.items.map((i) => i.youtubeVideoId).filter(Boolean) as string[]);

  const communityItems: HomeItem[] = feed.items.map((i) => ({
    key: `c:${i.publicId}`,
    kind: "community",
    title: i.title,
    thumbnailUrl: i.thumbnailUrl,
    creatorName: i.creator.displayName,
    creatorHandle: i.creator.handle,
    fromVidalyseCreator: true,
    publicId: i.publicId,
    likedByViewer: i.likedByViewer,
    likeCount: i.likeCount,
  }));

  const trendingItems: HomeItem[] = trending
    .filter((v) => !feedYtIds.has(v.videoId))
    .map((v) => {
      const handle = vidalyseByChannel.get(v.channelId) ?? null;
      return {
        key: `y:${v.videoId}`,
        kind: "youtube" as const,
        title: v.title,
        thumbnailUrl: v.thumbnailUrl,
        creatorName: v.channelTitle,
        creatorHandle: handle,
        fromVidalyseCreator: handle != null,
        followedByViewer: followedChannels.has(v.channelId),
        youtubeVideoId: v.videoId,
        channelId: v.channelId,
      };
    });

  // One mixed pool — Vidalyse and non-Vidalyse interleaved, not front-loaded.
  // Each item gets a random score plus a bonus when its creator is on Vidalyse,
  // so those trend toward the top but stay scattered throughout ("given two,
  // lean toward the one whose creator has a Vidalyse account").
  const VIDALYSE_BONUS = 0.4;
  const FOLLOW_BONUS = 0.6;
  return [...communityItems, ...trendingItems]
    .map((item) => ({
      item,
      score:
        Math.random() +
        (item.fromVidalyseCreator ? VIDALYSE_BONUS : 0) +
        (item.followedByViewer ? FOLLOW_BONUS : 0),
    }))
    .sort((a, b) => b.score - a.score)
    .map((x) => x.item)
    .slice(0, 36);
}
