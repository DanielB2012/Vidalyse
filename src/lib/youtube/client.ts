import { google } from "googleapis";
import { prisma } from "@/lib/prisma";

// Refreshes the Google OAuth access token when needed and returns an
// authorized OAuth2 client scoped to youtube.readonly / yt-analytics.readonly
// (the scopes requested at sign-in — see src/auth.ts). Never requests broader
// scopes than the feature actually needs (§82/§85).
// `linkId`, when given, pins the call to that specific channel instead of
// whichever one is "active" — used where the caller needs a channel that
// doesn't move when the user switches their active one in Settings (e.g. the
// community profile's own pinned channel, see maybeSyncYoutubePublications).
async function getAuthorizedOAuth2Client(userId: string, linkId?: string) {
  // Each linked YouTube channel (Settings → Chaînes YouTube connectées)
  // carries its own token set — a single Google login only exposes ONE
  // channel per authorization (see src/lib/youtube/channelAuth.ts), so
  // switching channels means switching which YoutubeChannelLink is active.
  // Users who've never used that flow have none yet: fall back to the
  // original single-channel token stored on the Account row from sign-in.
  const link = linkId
    ? await prisma.youtubeChannelLink.findFirst({ where: { id: linkId, userId } })
    : await prisma.youtubeChannelLink.findFirst({ where: { userId, active: true } });
  if (link?.accessToken) {
    return authorizedClientFromTokens({
      accessToken: link.accessToken,
      refreshToken: link.refreshToken,
      expiresAt: link.expiresAt,
      refresh: async (credentials) =>
        prisma.youtubeChannelLink.update({
          where: { id: link.id },
          data: {
            accessToken: credentials.access_token,
            expiresAt: credentials.expiry_date ? Math.floor(credentials.expiry_date / 1000) : null,
          },
        }),
    });
  }

  // A pinned link that's gone (unlinked) must not silently fall back to
  // whatever else the user happens to have connected.
  if (linkId) return null;

  // Fallback to the sign-in token — but only for accounts created back when
  // sign-in still requested the YouTube scopes. Modern sign-in is identity
  // only, so a user with no YoutubeChannelLink simply has no YouTube access
  // yet: return null so callers show the "connect a channel" path instead of
  // hitting a 403.
  const account = await prisma.account.findFirst({ where: { userId, provider: "google" } });
  if (!account?.access_token || !account.scope?.includes("youtube.readonly")) return null;
  return authorizedClientFromTokens({
    accessToken: account.access_token,
    refreshToken: account.refresh_token,
    expiresAt: account.expires_at,
    refresh: async (credentials) =>
      prisma.account.update({
        where: { id: account.id },
        data: {
          access_token: credentials.access_token,
          expires_at: credentials.expiry_date ? Math.floor(credentials.expiry_date / 1000) : null,
        },
      }),
  });
}

async function authorizedClientFromTokens({
  accessToken,
  refreshToken,
  expiresAt,
  refresh,
}: {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number | null;
  refresh: (credentials: { access_token?: string | null; expiry_date?: number | null }) => Promise<unknown>;
}) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );

  const isExpired = expiresAt ? expiresAt * 1000 < Date.now() : false;

  if (isExpired && refreshToken) {
    oauth2Client.setCredentials({ refresh_token: refreshToken });
    const { credentials } = await oauth2Client.refreshAccessToken();
    await refresh(credentials);
    oauth2Client.setCredentials(credentials);
  } else {
    oauth2Client.setCredentials({ access_token: accessToken, refresh_token: refreshToken });
  }

  return oauth2Client;
}

export async function getAuthorizedYoutubeClient(userId: string, linkId?: string) {
  const auth = await getAuthorizedOAuth2Client(userId, linkId);
  if (!auth) return null;
  return google.youtube({ version: "v3", auth });
}

export async function getAuthorizedYoutubeAnalyticsClient(userId: string, linkId?: string) {
  const auth = await getAuthorizedOAuth2Client(userId, linkId);
  if (!auth) return null;
  return google.youtubeAnalytics({ version: "v2", auth });
}

// Accepts a full watch/shorts/short URL or a bare 11-char id — never
// guesses at a malformed input, returns null so the caller can say so.
export function extractYoutubeVideoId(input: string): string | null {
  const trimmed = input.trim();
  const idPattern = /^[a-zA-Z0-9_-]{11}$/;
  if (idPattern.test(trimmed)) return trimmed;

  try {
    const url = new URL(trimmed);
    if (url.hostname.includes("youtu.be")) {
      const id = url.pathname.slice(1).split("/")[0];
      return idPattern.test(id) ? id : null;
    }
    if (url.hostname.includes("youtube.com")) {
      const v = url.searchParams.get("v");
      if (v && idPattern.test(v)) return v;
      const pathMatch = url.pathname.match(/\/(?:shorts|embed)\/([a-zA-Z0-9_-]{11})/);
      if (pathMatch) return pathMatch[1];
    }
  } catch {
    return null;
  }
  return null;
}

// Users who signed up before "Chaînes YouTube connectées" existed have a
// working YouTube connection (the Account row from sign-in) but no
// YoutubeChannelLink row, so it wouldn't show up in that list at all —
// confusing, since every other page using it works fine off the Account
// fallback. Called once from Settings: turns that implicit connection into a
// real, visible, manageable row the first time it's seen. No-op once the
// user has any link, including ones added through the real flow.
export async function ensurePrimaryChannelLink(userId: string): Promise<void> {
  const existingCount = await prisma.youtubeChannelLink.count({ where: { userId } });
  if (existingCount > 0) return;

  // fetchOwnChannel may refresh the Account's access token along the way —
  // re-read it afterwards so we copy a token that's actually still valid.
  const channel = await fetchOwnChannel(userId);
  if (!channel) return;
  const account = await prisma.account.findFirst({ where: { userId, provider: "google" } });
  if (!account?.access_token) return;

  await prisma.youtubeChannelLink.upsert({
    where: { userId_youtubeChannelId: { userId, youtubeChannelId: channel.youtubeId } },
    update: {},
    create: {
      userId,
      youtubeChannelId: channel.youtubeId,
      title: channel.title,
      handle: channel.handle,
      thumbnailUrl: channel.thumbnailUrl,
      accessToken: account.access_token,
      refreshToken: account.refresh_token,
      expiresAt: account.expires_at,
      scope: account.scope,
      active: true,
    },
  });
}

// The top-right avatar/name (src/app/(app)/layout.tsx) reads the Channel
// cache, not YoutubeChannelLink — keep it in sync whenever the active
// channel changes, or switching would silently show the wrong channel's
// name/picture until something else happened to refresh it. Stats reset to
// null (not carried over from the previous channel) and the content-type
// cache is dropped outright: both are per-channel and stale/wrong ones would
// actively mislead rather than just look outdated.
export async function syncActiveChannelCache(
  userId: string,
  link: { youtubeChannelId: string; title: string | null; thumbnailUrl: string | null }
): Promise<void> {
  await prisma.channel.upsert({
    where: { userId },
    update: {
      youtubeId: link.youtubeChannelId,
      title: link.title ?? link.youtubeChannelId,
      thumbnailUrl: link.thumbnailUrl,
      subscriberCount: null,
      videoCount: null,
      viewCount: null,
      fetchedAt: new Date(),
    },
    create: {
      userId,
      youtubeId: link.youtubeChannelId,
      title: link.title ?? link.youtubeChannelId,
      thumbnailUrl: link.thumbnailUrl,
    },
  });
  await prisma.channelContentCache.deleteMany({ where: { userId } });
}

export interface OwnChannelSummary {
  youtubeId: string;
  title: string;
  handle: string | null; // "@handle" — snippet.customUrl, real value or null, never guessed
  thumbnailUrl: string | null;
  subscriberCount: number | null;
  videoCount: number | null;
  viewCount: number | null;
}

export async function fetchOwnChannel(userId: string, linkId?: string): Promise<OwnChannelSummary | null> {
  const youtube = await getAuthorizedYoutubeClient(userId, linkId);
  if (!youtube) return null;

  const res = await youtube.channels.list({
    part: ["snippet", "statistics"],
    mine: true,
  });

  const channel = res.data.items?.[0];
  if (!channel?.id) return null;

  const customUrl = channel.snippet?.customUrl ?? null;
  return {
    youtubeId: channel.id,
    title: channel.snippet?.title ?? "Chaîne YouTube",
    handle: customUrl ? (customUrl.startsWith("@") ? customUrl : `@${customUrl}`) : null,
    thumbnailUrl: channel.snippet?.thumbnails?.medium?.url ?? null,
    subscriberCount: channel.statistics?.hiddenSubscriberCount
      ? null
      : Number(channel.statistics?.subscriberCount ?? 0),
    videoCount: channel.statistics?.videoCount ? Number(channel.statistics.videoCount) : null,
    viewCount: channel.statistics?.viewCount ? Number(channel.statistics.viewCount) : null,
  };
}
