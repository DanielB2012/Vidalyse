import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { syncActiveChannelCache } from "@/lib/youtube/client";

export async function POST(_req: Request, { params }: { params: Promise<{ linkId: string }> }) {
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

  await prisma.$transaction([
    prisma.youtubeChannelLink.updateMany({ where: { userId }, data: { active: false } }),
    prisma.youtubeChannelLink.update({ where: { id: linkId }, data: { active: true } }),
  ]);
  await syncActiveChannelCache(userId, link);

  return NextResponse.json({ ok: true });
}
