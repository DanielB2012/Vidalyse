import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const videos = await prisma.video.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    include: { jobs: { orderBy: { createdAt: "desc" }, take: 1 } },
  });

  return NextResponse.json(
    videos.map((v) => ({
      id: v.id,
      title: v.title,
      durationSec: v.durationSec,
      hasThumbnail: Boolean(v.thumbnailPath),
      createdAt: v.createdAt,
      latestJob: v.jobs[0]
        ? { id: v.jobs[0].id, status: v.jobs[0].status, currentStage: v.jobs[0].currentStage }
        : null,
    }))
  );
}
