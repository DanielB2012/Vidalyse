import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { fetchOwnChannel } from "@/lib/youtube/client";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  try {
    const channel = await fetchOwnChannel(session.user.id);
    if (!channel) {
      return NextResponse.json({ error: "no_channel_or_missing_permission" }, { status: 404 });
    }

    const saved = await prisma.channel.upsert({
      where: { userId: session.user.id },
      update: {
        title: channel.title,
        thumbnailUrl: channel.thumbnailUrl,
        subscriberCount: channel.subscriberCount,
        videoCount: channel.videoCount,
        viewCount: channel.viewCount ? BigInt(channel.viewCount) : null,
        fetchedAt: new Date(),
      },
      create: {
        userId: session.user.id,
        youtubeId: channel.youtubeId,
        title: channel.title,
        thumbnailUrl: channel.thumbnailUrl,
        subscriberCount: channel.subscriberCount,
        videoCount: channel.videoCount,
        viewCount: channel.viewCount ? BigInt(channel.viewCount) : null,
      },
    });

    return NextResponse.json({
      ...saved,
      viewCount: saved.viewCount ? saved.viewCount.toString() : null,
    });
  } catch (error) {
    console.error("[youtube/channel] fetch failed", error);
    return NextResponse.json({ error: "youtube_api_error" }, { status: 502 });
  }
}
