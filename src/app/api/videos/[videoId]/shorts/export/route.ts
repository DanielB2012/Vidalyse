import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { cutClip } from "@/lib/media/ffmpeg";
import { buildSrtForClip } from "@/lib/media/buildSrt";
import { userUploadDir } from "@/lib/media/paths";
import { loadLatestResult } from "@/lib/analysis/loadResult";

const RELIABLE_SOURCES = new Set(["author_subtitles_embedded", "author_subtitles_sidecar", "whisper_local"]);

// Real ffmpeg cut of one Short candidate (§8). Supports 9:16 output and burned
// subtitles built from the stored transcript — never fabricated. The file lands
// in the user's private storage; optionally persisted as a ShortClip (§9).
export async function POST(req: Request, { params }: { params: Promise<{ videoId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const userId = session.user.id;
  const { videoId } = await params;

  const body = (await req.json().catch(() => ({}))) as {
    startMs?: number;
    endMs?: number;
    vertical?: boolean;
    cropMode?: "center" | "letterbox";
    burnSubtitles?: boolean;
    save?: boolean;
    title?: string;
    score?: number;
    reason?: string;
  };

  const startMs = Math.max(0, Math.round(Number(body.startMs)));
  const endMs = Math.round(Number(body.endMs));
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return NextResponse.json({ error: "Bornes invalides." }, { status: 400 });
  }
  if (endMs - startMs > 180_000) {
    return NextResponse.json({ error: "Extrait trop long (max 3 min)." }, { status: 400 });
  }

  const video = await prisma.video.findUnique({ where: { id: videoId } });
  if (!video || video.userId !== userId || !video.storagePath) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (video.durationSec && startMs / 1000 > video.durationSec) {
    return NextResponse.json({ error: "Début après la fin de la vidéo." }, { status: 400 });
  }

  const outDir = path.join(userUploadDir(userId), "shorts");
  const vertical = Boolean(body.vertical);
  const cropMode = body.cropMode === "letterbox" ? "letterbox" : "center";
  const outName = `${video.id}_${startMs}-${endMs}${vertical ? "_v" : ""}.mp4`;
  const outPath = path.join(outDir, outName);

  // Subtitles — only from a real transcript, never invented.
  let subtitlesFileName: string | undefined;
  let srtPath: string | undefined;
  if (body.burnSubtitles) {
    const loaded = await loadLatestResult(userId, videoId);
    if (loaded.error) {
      return NextResponse.json(
        { error: "Sous-titres impossibles : aucune analyse terminée pour cette vidéo." },
        { status: 409 }
      );
    }
    const src = loaded.result.transcriptSource ?? null;
    if (!src || !RELIABLE_SOURCES.has(src)) {
      return NextResponse.json(
        {
          error:
            "Aucune transcription fiable pour cette vidéo — Vidalyse ne génère pas de faux sous-titres. Utilise les sous-titres de l'auteur ou une transcription Whisper.",
        },
        { status: 422 }
      );
    }
    const srt = buildSrtForClip(loaded.result.transcript ?? [], startMs, endMs);
    if (!srt) {
      return NextResponse.json(
        { error: "Aucun texte transcrit sur cet intervalle — pas de sous-titres à incruster." },
        { status: 422 }
      );
    }
    await fs.mkdir(outDir, { recursive: true });
    subtitlesFileName = `${path.parse(outName).name}.srt`;
    srtPath = path.join(outDir, subtitlesFileName);
    await fs.writeFile(srtPath, srt, "utf8");
  }

  try {
    await cutClip(video.storagePath, outPath, startMs / 1000, endMs / 1000, {
      vertical,
      cropMode,
      subtitlesFileName,
    });
  } catch (err) {
    if (body.save) {
      await prisma.shortClip
        .create({
          data: {
            userId,
            videoId,
            startMs,
            endMs,
            title: body.title?.slice(0, 200) ?? null,
            score: Number.isFinite(body.score) ? Number(body.score) : null,
            reason: body.reason?.slice(0, 400) ?? null,
            vertical,
            burnedSubtitles: Boolean(subtitlesFileName),
            status: "FAILED",
            exportError: err instanceof Error ? err.message.slice(0, 400) : String(err),
          },
        })
        .catch(() => {});
    }
    return NextResponse.json(
      { error: `ffmpeg n'a pas pu produire l'extrait : ${err instanceof Error ? err.message.split("\n")[0] : err}` },
      { status: 500 }
    );
  } finally {
    if (srtPath) await fs.rm(srtPath, { force: true }).catch(() => {});
  }

  let clipId: string | undefined;
  if (body.save) {
    const clip = await prisma.shortClip.create({
      data: {
        userId,
        videoId,
        startMs,
        endMs,
        title: body.title?.slice(0, 200) ?? null,
        score: Number.isFinite(body.score) ? Number(body.score) : null,
        reason: body.reason?.slice(0, 400) ?? null,
        vertical,
        burnedSubtitles: Boolean(subtitlesFileName),
        status: "EXPORTED",
        exportPath: outPath,
      },
    });
    clipId = clip.id;
  }

  return NextResponse.json({
    url: `/api/videos/${videoId}/shorts/file?name=${encodeURIComponent(outName)}`,
    name: outName,
    startMs,
    endMs,
    vertical,
    clipId,
  });
}
