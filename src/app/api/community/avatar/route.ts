import fs from "node:fs/promises";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { AVATARS_DIR, avatarPath, ensureDir } from "@/lib/media/paths";
import { SOCIAL_ENABLED } from "@/lib/features";

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

// Upload a local image as the community-profile avatar (§1). Auth-gated;
// the file is decoded + re-encoded with sharp (which also rejects a non-image
// renamed to .jpg), normalised to a 256×256 JPEG, and stored under
// storage/avatars/<userId>.jpg — keyed by the session user, never a client path.
export async function POST(req: Request) {
  if (!SOCIAL_ENABLED) return new NextResponse(null, { status: 404 });
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const userId = session.user.id;

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Aucun fichier." }, { status: 400 });
  }
  if (!ALLOWED.has(file.type)) {
    return NextResponse.json({ error: "unsupported_type" }, { status: 415 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "too_large" }, { status: 413 });
  }

  const input = Buffer.from(await file.arrayBuffer());

  interface SharpPipeline {
    rotate(): SharpPipeline;
    resize(w: number, h: number, opts?: { fit?: "cover" | "contain" | "fill" }): SharpPipeline;
    jpeg(opts?: { quality?: number }): SharpPipeline;
    toBuffer(): Promise<Buffer>;
  }
  type SharpFactory = (input: Buffer) => SharpPipeline;

  let output: Buffer;
  try {
    const mod = (await import("sharp")) as unknown as { default?: SharpFactory };
    const sharp: SharpFactory = mod.default ?? (mod as unknown as SharpFactory);
    output = await sharp(input)
      .rotate() // honour EXIF orientation
      .resize(256, 256, { fit: "cover" })
      .jpeg({ quality: 82 })
      .toBuffer();
  } catch {
    return NextResponse.json({ error: "unreadable_image" }, { status: 422 });
  }

  await ensureDir(AVATARS_DIR);
  await fs.writeFile(avatarPath(userId), output);

  const url = `/api/community/avatar/${userId}?v=${Date.now()}`;
  // Point an existing profile at the new file straight away. If there's no
  // profile row yet, the value rides along on the next savePublicProfile.
  await prisma.publicProfile.updateMany({ where: { userId }, data: { avatarUrl: url } });

  return NextResponse.json({ url });
}
