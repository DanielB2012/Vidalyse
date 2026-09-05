import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function GET(_req: Request, { params }: { params: Promise<{ videoId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const { videoId } = await params;

  const video = await prisma.video.findUnique({
    where: { id: videoId },
    include: { jobs: { orderBy: { createdAt: "desc" }, take: 1 } },
  });

  if (!video || video.userId !== session.user.id) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({
    id: video.id,
    title: video.title,
    durationSec: video.durationSec,
    width: video.width,
    height: video.height,
    fps: video.fps,
    sizeBytes: video.sizeBytes,
    hasThumbnail: Boolean(video.thumbnailPath),
    createdAt: video.createdAt,
    latestJobId: video.jobs[0]?.id ?? null,
  });
}
