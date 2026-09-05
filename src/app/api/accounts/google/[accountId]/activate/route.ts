import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

// Switches which linked Google account YouTube API calls use
// (src/lib/youtube/client.ts reads the `active` row for the user).
export async function POST(_req: Request, { params }: { params: Promise<{ accountId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const { accountId } = await params;
  const userId = session.user.id;

  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account || account.userId !== userId || account.provider !== "google") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  await prisma.$transaction([
    prisma.account.updateMany({ where: { userId, provider: "google" }, data: { active: false } }),
    prisma.account.update({ where: { id: accountId }, data: { active: true } }),
  ]);

  return NextResponse.json({ ok: true });
}
