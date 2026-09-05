import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

async function assertOwnership(userId: string, videoId: string): Promise<boolean> {
  const video = await prisma.video.findUnique({ where: { id: videoId }, select: { userId: true } });
  return Boolean(video && video.userId === userId);
}

// Persisted Short candidates for a video (§9). Survives reloads / sessions.
export async function GET(_req: Request, { params }: { params: Promise<{ videoId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { videoId } = await params;
  if (!(await assertOwnership(session.user.id, videoId))) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const clips = await prisma.shortClip.findMany({
    where: { userId: session.user.id, videoId },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(
    clips.map((c) => ({
      id: c.id,
      startMs: c.startMs,
      endMs: c.endMs,
      title: c.title,
      score: c.score,
      reason: c.reason,
      vertical: c.vertical,
      burnedSubtitles: c.burnedSubtitles,
      status: c.status,
      exportError: c.exportError,
      hasFile: Boolean(c.exportPath),
      fileUrl: c.exportPath
        ? `/api/videos/${videoId}/shorts/file?name=${encodeURIComponent(c.exportPath.split(/[\\/]/).pop() ?? "")}`
        : null,
      createdAt: c.createdAt,
    }))
  );
}

export async function POST(req: Request, { params }: { params: Promise<{ videoId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { videoId } = await params;
  if (!(await assertOwnership(session.user.id, videoId))) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    startMs?: number;
    endMs?: number;
    score?: number;
    reason?: string;
    title?: string;
    vertical?: boolean;
  };
  const startMs = Math.max(0, Math.round(Number(body.startMs)));
  const endMs = Math.round(Number(body.endMs));
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return NextResponse.json({ error: "Bornes invalides." }, { status: 400 });
  }

  const clip = await prisma.shortClip.create({
    data: {
      userId: session.user.id,
      videoId,
      startMs,
      endMs,
      title: body.title?.slice(0, 200) ?? null,
      score: Number.isFinite(body.score) ? Number(body.score) : null,
      reason: body.reason?.slice(0, 400) ?? null,
      vertical: Boolean(body.vertical),
      status: "PROPOSED",
    },
  });
  return NextResponse.json({ id: clip.id });
}
