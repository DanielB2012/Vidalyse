import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

// Only the containers VideoUploadForm actually accepts (validation.ts) — an
// unrecognized extension falls back to a generic binary type rather than
// guessing, honest per this codebase's "ne jamais inventer" rule.
const MIME_BY_EXT: Record<string, string> = {
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".mkv": "video/x-matroska",
  ".avi": "video/x-msvideo",
};

// HTTP Range support (spec: the user must be able to scrub/seek — without
// it <video> can only play from the start and can't jump around).
export async function GET(req: Request, { params }: { params: Promise<{ videoId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const { videoId } = await params;

  const video = await prisma.video.findUnique({ where: { id: videoId } });
  if (!video || video.userId !== session.user.id || !video.storagePath) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  let stat: fs.Stats;
  try {
    stat = await fsp.stat(video.storagePath);
  } catch {
    return NextResponse.json({ error: "file_missing" }, { status: 404 });
  }

  const contentType = MIME_BY_EXT[path.extname(video.storagePath).toLowerCase()] ?? "application/octet-stream";
  const range = req.headers.get("range");

  if (!range) {
    const nodeStream = fs.createReadStream(video.storagePath);
    return new NextResponse(Readable.toWeb(nodeStream) as unknown as ReadableStream, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(stat.size),
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, max-age=3600",
      },
    });
  }

  const match = /bytes=(\d*)-(\d*)/.exec(range);
  const start = match?.[1] ? parseInt(match[1], 10) : 0;
  const end = match?.[2] ? parseInt(match[2], 10) : stat.size - 1;

  const nodeStream = fs.createReadStream(video.storagePath, { start, end });
  return new NextResponse(Readable.toWeb(nodeStream) as unknown as ReadableStream, {
    status: 206,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(end - start + 1),
      "Content-Range": `bytes ${start}-${end}/${stat.size}`,
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
