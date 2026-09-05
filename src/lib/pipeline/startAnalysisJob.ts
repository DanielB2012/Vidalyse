import { prisma } from "@/lib/prisma";
import { runAnalysisPipeline } from "./analyzeVideo";

export type StartAnalysisResult =
  | { ok: true; jobId: string; reused: boolean }
  | { ok: false; error: string };

// Shared by the "Lancer l'analyse" button (api/videos/[videoId]/analyze) and
// Lyra's chat-triggered analysis (api/lyra) — one real path to start a job,
// never two divergent implementations of the same check.
export async function startAnalysisJob(userId: string, videoId: string): Promise<StartAnalysisResult> {
  const video = await prisma.video.findUnique({ where: { id: videoId } });
  if (!video || video.userId !== userId) {
    return { ok: false, error: "not_found" };
  }
  // A YOUTUBE_URL video has no local file yet — the pipeline downloads it from
  // YouTube as its first step (see runAnalysisPipeline). An UPLOAD video with
  // no file is genuinely broken and can't be analyzed.
  if (!video.storagePath && !(video.source === "YOUTUBE_URL" && video.youtubeVideoId)) {
    return {
      ok: false,
      error: "Cette vidéo n'a pas de fichier source.",
    };
  }

  const existingActive = await prisma.analysisJob.findFirst({
    where: { videoId, status: { in: ["PENDING", "RUNNING"] } },
    orderBy: { createdAt: "desc" },
  });
  if (existingActive) {
    return { ok: true, jobId: existingActive.id, reused: true };
  }

  const job = await prisma.analysisJob.create({
    data: { userId, videoId, status: "PENDING" },
  });

  // Fire-and-forget: the pipeline runs for as long as this Node process is
  // alive (see the note in analyzeVideo.ts). Errors are captured inside the
  // pipeline itself and written to the job row, never thrown here.
  void runAnalysisPipeline(job.id).catch((err) => {
    console.error(`[pipeline] job ${job.id} crashed outside its own error handling`, err);
  });

  return { ok: true, jobId: job.id, reused: false };
}
