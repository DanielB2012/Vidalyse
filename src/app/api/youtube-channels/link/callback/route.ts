import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { google } from "googleapis";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { createOAuth2Client, LINK_STATE_COOKIE } from "@/lib/youtube/channelAuth";
import { syncActiveChannelCache } from "@/lib/youtube/client";

function toSettings(req: Request, param: string) {
  return NextResponse.redirect(new URL(`/settings?${param}`, req.url));
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  const cookieStore = await cookies();
  const expectedState = cookieStore.get(LINK_STATE_COOKIE)?.value;
  cookieStore.delete(LINK_STATE_COOKIE);

  if (oauthError) return toSettings(req, "channelError=denied");
  if (!code || !state || !expectedState || state !== expectedState) {
    return toSettings(req, "channelError=invalid_state");
  }

  const redirectUri = new URL("/api/youtube-channels/link/callback", req.url).toString();
  const oauth2Client = createOAuth2Client(redirectUri);

  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    const youtube = google.youtube({ version: "v3", auth: oauth2Client });
    const res = await youtube.channels.list({ part: ["snippet"], mine: true });
    const channel = res.data.items?.[0];
    if (!channel?.id) return toSettings(req, "channelError=no_channel");

    const userId = session.user.id;
    const customUrl = channel.snippet?.customUrl ?? null;
    const handle = customUrl ? (customUrl.startsWith("@") ? customUrl : `@${customUrl}`) : null;
    const title = channel.snippet?.title ?? null;
    const thumbnailUrl = channel.snippet?.thumbnails?.medium?.url ?? null;
    const existingCount = await prisma.youtubeChannelLink.count({ where: { userId } });
    const becomesActive = existingCount === 0;

    await prisma.youtubeChannelLink.upsert({
      where: { userId_youtubeChannelId: { userId, youtubeChannelId: channel.id } },
      update: {
        title,
        handle,
        thumbnailUrl,
        accessToken: tokens.access_token ?? null,
        refreshToken: tokens.refresh_token ?? undefined, // Google omits it on repeat consents — keep the one we have
        expiresAt: tokens.expiry_date ? Math.floor(tokens.expiry_date / 1000) : null,
        scope: tokens.scope ?? null,
      },
      create: {
        userId,
        youtubeChannelId: channel.id,
        title,
        handle,
        thumbnailUrl,
        accessToken: tokens.access_token ?? null,
        refreshToken: tokens.refresh_token ?? null,
        expiresAt: tokens.expiry_date ? Math.floor(tokens.expiry_date / 1000) : null,
        scope: tokens.scope ?? null,
        active: becomesActive,
      },
    });

    if (becomesActive) {
      await syncActiveChannelCache(userId, { youtubeChannelId: channel.id, title, thumbnailUrl });
    }

    return toSettings(req, "channelLinked=1");
  } catch {
    return toSettings(req, "channelError=exchange_failed");
  }
}
