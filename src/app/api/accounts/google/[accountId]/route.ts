import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

// Unlinks a Google account from the current Vidalyse user. Always keeps at
// least one: with none left, the next sign-in for this identity would find
// no matching Account row and Auth.js would spin up a brand new (empty)
// Vidalyse profile instead of returning to this one — see src/auth.ts.
export async function DELETE(_req: Request, { params }: { params: Promise<{ accountId: string }> }) {
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

  const total = await prisma.account.count({ where: { userId, provider: "google" } });
  if (total <= 1) {
    return NextResponse.json({ error: "last_account" }, { status: 400 });
  }

  await prisma.account.delete({ where: { id: accountId } });

  if (account.active) {
    const another = await prisma.account.findFirst({ where: { userId, provider: "google" } });
    if (another) await prisma.account.update({ where: { id: another.id }, data: { active: true } });
  }

  return NextResponse.json({ ok: true });
}
