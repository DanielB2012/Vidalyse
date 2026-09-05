import path from "node:path";
import fs from "node:fs/promises";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { userUploadDir, ensureDir } from "@/lib/media/paths";
import { probeVideo, generateThumbnail } from "@/lib/media/ffmpeg";
import {
  ALLOWED_VIDEO_EXTENSIONS,
  MAX_UPLOAD_BYTES,
  hasAllowedVideoExtension,
} from "@/lib/media/validation";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const userId = session.user.id;

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Requête invalide (formulaire multipart attendu)." }, { status: 400 });
  }

  const file = formData.get("file");
  const title = formData.get("title");
  const purposeRaw = formData.get("purpose");
  const plannedTitle = formData.get("plannedTitle");
  const plannedDescription = formData.get("plannedDescription");
  const purpose = purposeRaw === "pre_publish" ? "PRE_PUBLISH" : "ANALYSIS";

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Aucun fichier vidéo reçu." }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "Le fichier est vide." }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: `Fichier trop volumineux. Limite actuelle : ${MAX_UPLOAD_BYTES / (1024 * 1024 * 1024)} Go.` },
      { status: 413 }
    );
  }
  if (!hasAllowedVideoExtension(file.name)) {
    return NextResponse.json(
      { error: `Format non supporté. Formats acceptés : ${ALLOWED_VIDEO_EXTENSIONS.join(", ")}.` },
      { status: 415 }
    );
  }

  const video = await prisma.video.create({
    data: {
      userId,
      source: "UPLOAD",
      purpose,
      title: typeof title === "string" && title.trim() ? title.trim() : file.name,
      plannedTitle:
        typeof plannedTitle === "string" && plannedTitle.trim() ? plannedTitle.trim().slice(0, 300) : null,
      plannedDescription:
        typeof plannedDescription === "string" && plannedDescription.trim()
          ? plannedDescription.trim().slice(0, 5000)
          : null,
      originalFilename: file.name,
      sizeBytes: file.size,
    },
  });

  const ext = path.extname(file.name) || ".mp4";
  const dir = userUploadDir(userId);
  await ensureDir(dir);
  const storagePath = path.join(dir, `${video.id}${ext}`);

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(storagePath, buffer);
  } catch {
    await prisma.video.delete({ where: { id: video.id } });
    return NextResponse.json({ error: "Échec de l'écriture du fichier sur le disque." }, { status: 500 });
  }

  let info;
  try {
    info = await probeVideo(storagePath);
  } catch {
    // Not a valid/decodable video — never keep a broken row or file around
    // pretending it's an importable video (§106).
    await fs.rm(storagePath, { force: true });
    await prisma.video.delete({ where: { id: video.id } });
    return NextResponse.json(
      { error: "Format vidéo invalide ou fichier corrompu — impossible de le lire avec ffmpeg." },
      { status: 422 }
    );
  }

  let thumbnailPath: string | null = null;
  try {
    const thumbAt = Math.min(1, info.durationSec / 2);
    const thumbPath = path.join(dir, `${video.id}-thumb.jpg`);
    await generateThumbnail(storagePath, thumbPath, thumbAt);
    thumbnailPath = thumbPath;
  } catch {
    // Thumbnail is a nice-to-have; a failure here shouldn't fail the upload.
    thumbnailPath = null;
  }

  const updated = await prisma.video.update({
    where: { id: video.id },
    data: {
      storagePath,
      thumbnailPath,
      durationSec: info.durationSec,
      width: info.width,
      height: info.height,
      fps: info.fps,
    },
  });

  return NextResponse.json({
    id: updated.id,
    title: updated.title,
    purpose: updated.purpose,
    durationSec: updated.durationSec,
    width: updated.width,
    height: updated.height,
    hasThumbnail: Boolean(updated.thumbnailPath),
    sizeBytes: updated.sizeBytes,
    createdAt: updated.createdAt,
  });
}
