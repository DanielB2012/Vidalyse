import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { startAnalysisJob } from "@/lib/pipeline/startAnalysisJob";
import { fetchYoutubeVideoTitle } from "@/lib/youtube/download";

// Analyse a published YouTube video "directly" — no manual file import.
// We create (or reuse) a YOUTUBE_URL Video row for this channel video; the
// pipeline downloads the actual file from YouTube as its first step.
export async function POST(req: Request, { params }: { params: Promise<{ youtubeVideoId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const userId = session.user.id;
  const { youtubeVideoId } = await params;

  if (!/^[\w-]{11}$/.test(youtubeVideoId)) {
    return NextResponse.json({ error: "Identifiant YouTube invalide." }, { status: 400 });
  }

  let title: string | undefined;
  try {
    const body = await req.json();
    if (body && typeof body.title === "string" && body.title.trim()) title = body.title.trim();
  } catch {
    // no body / not JSON — fine, title stays undefined
  }

  let video = await prisma.video.findFirst({
    where: { userId, youtubeVideoId },
    orderBy: { createdAt: "desc" },
  });

  // No title given (e.g. a link pasted for a video outside the user's own
  // channel, where we don't already have it from the YouTube Data API) —
  // fetch it so the video isn't stuck showing as "untitled". Best-effort:
  // the pipeline works fine without it, it's purely cosmetic.
  if (!title && !video?.title) {
    title = (await fetchYoutubeVideoTitle(youtubeVideoId).catch(() => null)) ?? undefined;
  }

  if (!video) {
    video = await prisma.video.create({
      data: {
        userId,
        source: "YOUTUBE_URL",
        youtubeVideoId,
        youtubeUrl: `https://www.youtube.com/watch?v=${youtubeVideoId}`,
        title: title ?? null,
      },
    });
  } else if (title && !video.title) {
    video = await prisma.video.update({ where: { id: video.id }, data: { title } });
  }

  const result = await startAnalysisJob(userId, video.id);
  if (!result.ok) {
    const status = result.error === "not_found" ? 404 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({ jobId: result.jobId, reused: result.reused, videoId: video.id });
}
