import fs from "node:fs/promises";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

// Delete a saved Short (§9) and its exported file. Ownership checked on both the
// video and the clip so an ID guess can't touch another user's data.
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ videoId: string; clipId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { videoId, clipId } = await params;

  const clip = await prisma.shortClip.findUnique({ where: { id: clipId } });
  if (!clip || clip.userId !== session.user.id || clip.videoId !== videoId) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  if (clip.exportPath) {
    await fs.rm(clip.exportPath, { force: true }).catch(() => {});
  }
  await prisma.shortClip.delete({ where: { id: clipId } });
  return NextResponse.json({ ok: true });
}
