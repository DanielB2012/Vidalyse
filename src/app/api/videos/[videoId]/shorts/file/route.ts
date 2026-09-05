import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { userUploadDir } from "@/lib/media/paths";

// Serves an exported Short back to its owner. The `name` is strictly validated
// against `<videoId>_<start>-<end>.mp4` so it can never escape the shorts dir.
export async function GET(req: Request, { params }: { params: Promise<{ videoId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const { videoId } = await params;
  const name = new URL(req.url).searchParams.get("name") ?? "";

  // Strict allow-list: "<cuid>_<start>-<end>[_v].mp4", no separators possible,
  // and the resolved basename must equal the input (defence in depth vs. traversal).
  const safeId = videoId.replace(/[^a-zA-Z0-9_-]/g, "");
  if (
    path.basename(name) !== name ||
    !new RegExp(`^${safeId}_\\d+-\\d+(_v)?\\.mp4$`).test(name)
  ) {
    return NextResponse.json({ error: "bad_name" }, { status: 400 });
  }

  const video = await prisma.video.findUnique({ where: { id: videoId }, select: { userId: true } });
  if (!video || video.userId !== session.user.id) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const filePath = path.join(userUploadDir(session.user.id), "shorts", name);
  let stat: fs.Stats;
  try {
    stat = await fsp.stat(filePath);
  } catch {
    return NextResponse.json({ error: "file_missing" }, { status: 404 });
  }

  const range = req.headers.get("range");
  const baseHeaders = {
    "Content-Type": "video/mp4",
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=600",
    "Content-Disposition": `inline; filename="${name}"`,
  };

  if (range) {
    const match = /bytes=(\d*)-(\d*)/.exec(range);
    const start = match?.[1] ? parseInt(match[1], 10) : 0;
    const end = match?.[2] ? parseInt(match[2], 10) : stat.size - 1;
    const nodeStream = fs.createReadStream(filePath, { start, end });
    return new NextResponse(Readable.toWeb(nodeStream) as unknown as ReadableStream, {
      status: 206,
      headers: {
        ...baseHeaders,
        "Content-Length": String(end - start + 1),
        "Content-Range": `bytes ${start}-${end}/${stat.size}`,
      },
    });
  }

  const nodeStream = fs.createReadStream(filePath);
  return new NextResponse(Readable.toWeb(nodeStream) as unknown as ReadableStream, {
    status: 200,
    headers: { ...baseHeaders, "Content-Length": String(stat.size) },
  });
}
