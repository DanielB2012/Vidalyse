import fs from "node:fs/promises";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { avatarPath } from "@/lib/media/paths";
import { SOCIAL_ENABLED } from "@/lib/features";

// Serve a community-profile avatar. Visible to any logged-in viewer when the
// profile is public; otherwise only to its owner (matches getVisiblePublicProfile).
export async function GET(_req: Request, { params }: { params: Promise<{ userId: string }> }) {
  if (!SOCIAL_ENABLED) return new NextResponse(null, { status: 404 });
  const { userId } = await params;

  const profile = await prisma.publicProfile.findUnique({
    where: { userId },
    select: { isPublic: true, userId: true },
  });
  if (!profile) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (!profile.isPublic) {
    const session = await auth();
    if (session?.user?.id !== profile.userId) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
  }

  try {
    const buf = await fs.readFile(avatarPath(userId));
    return new NextResponse(new Uint8Array(buf), {
      headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=300" },
    });
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
}
