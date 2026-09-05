import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { syncActiveChannelCache } from "@/lib/youtube/client";

export async function DELETE(_req: Request, { params }: { params: Promise<{ linkId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const { linkId } = await params;
  const userId = session.user.id;

  const link = await prisma.youtubeChannelLink.findUnique({ where: { id: linkId } });
  if (!link || link.userId !== userId) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  await prisma.youtubeChannelLink.delete({ where: { id: linkId } });

  if (link.active) {
    const another = await prisma.youtubeChannelLink.findFirst({ where: { userId } });
    if (another) {
      await prisma.youtubeChannelLink.update({ where: { id: another.id }, data: { active: true } });
      await syncActiveChannelCache(userId, another);
    }
  }

  return NextResponse.json({ ok: true });
}
