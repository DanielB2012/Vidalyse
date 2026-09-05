import fs from "node:fs/promises";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isFeedVisible } from "@/lib/community/visibility";
import { SOCIAL_ENABLED } from "@/lib/features";

// Public thumbnail for a community publication (§13 Phase B). Unlike
// /api/videos/[videoId]/thumbnail (owner-only), this one serves the image to any
// logged-in viewer — but ONLY when the publication is actually visible in the
// feed: published AND the owner's profile is public. No ownership check, by
// design; the two public switches are the gate.
export async function GET(_req: Request, { params }: { params: Promise<{ publicId: string }> }) {
  if (!SOCIAL_ENABLED) return new NextResponse(null, { status: 404 });
  const { publicId } = await params;

  const pub = await prisma.publicVideo.findUnique({
    where: { publicId },
    select: {
      isPublic: true,
      youtubePublic: true,
      videoId: true,
      user: { select: { publicProfile: { select: { isPublic: true } } } },
    },
  });

  if (
    !pub ||
    !pub.videoId ||
    !isFeedVisible({
      publicationIsPublic: pub.isPublic,
      youtubePublic: pub.youtubePublic,
      ownerProfileIsPublic: pub.user.publicProfile?.isPublic ?? false,
    })
  ) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const video = await prisma.video.findUnique({
    where: { id: pub.videoId },
    select: { thumbnailPath: true },
  });
  if (!video?.thumbnailPath) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  try {
    const buffer = await fs.readFile(video.thumbnailPath);
    return new NextResponse(new Uint8Array(buffer), {
      headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=3600" },
    });
  } catch {
    return NextResponse.json({ error: "thumbnail_missing" }, { status: 404 });
  }
}
