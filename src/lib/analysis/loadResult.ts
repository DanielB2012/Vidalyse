import { prisma } from "@/lib/prisma";
import type { MergedAnalysis } from "@/lib/pipeline/types";

export type LoadResult =
  | { error: "not_found" | "no_result" }
  | {
      error: null;
      video: {
        id: string;
        title: string | null;
        originalFilename: string | null;
        storagePath: string | null;
        durationSec: number | null;
        youtubeVideoId: string | null;
        thumbnailPath: string | null;
      };
      result: MergedAnalysis;
    };

// One place to fetch the most recent COMPLETED analysis of a video the caller
// owns — shared by the Shorts and pre-publish routes.
export async function loadLatestResult(userId: string, videoId: string): Promise<LoadResult> {
  const video = await prisma.video.findUnique({
    where: { id: videoId },
    include: { jobs: { where: { status: "COMPLETED" }, orderBy: { createdAt: "desc" }, take: 1 } },
  });
  if (!video || video.userId !== userId) return { error: "not_found" };
  const job = video.jobs[0];
  if (!job || !job.result) return { error: "no_result" };
  return {
    error: null,
    video: {
      id: video.id,
      title: video.title,
      originalFilename: video.originalFilename,
      storagePath: video.storagePath,
      durationSec: video.durationSec,
      youtubeVideoId: video.youtubeVideoId,
      thumbnailPath: video.thumbnailPath,
    },
    result: job.result as unknown as MergedAnalysis,
  };
}
