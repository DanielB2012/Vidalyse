import { prisma } from "@/lib/prisma";
import type { MergedAnalysis } from "@/lib/pipeline/types";
import type { ComparableVideo } from "./youtubeComparison";

// The "own channel" comparison corpus: this user's other COMPLETED analyses
// (§14 — never global data). Shared by the pipeline and the on-demand
// comparison route so both see the same set.
export async function loadChannelPriors(
  userId: string,
  excludeVideoId: string,
  limit = 20
): Promise<(ComparableVideo & { youtubeVideoId: string | null })[]> {
  const jobs = await prisma.analysisJob.findMany({
    where: { userId, status: "COMPLETED", videoId: { not: excludeVideoId } },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      video: {
        select: {
          id: true,
          title: true,
          originalFilename: true,
          durationSec: true,
          youtubeVideoId: true,
        },
      },
    },
  });

  const seen = new Set<string>();
  const priors: (ComparableVideo & { youtubeVideoId: string | null })[] = [];
  for (const job of jobs) {
    if (seen.has(job.videoId)) continue;
    seen.add(job.videoId);
    const result = job.result as unknown as MergedAnalysis | null;
    if (!result) continue;
    const hookText = (result.transcript ?? [])
      .filter((s) => s.timestampMs < 15000)
      .map((s) => s.text.trim())
      .join(" ")
      .trim();
    const hookWords = hookText
      .toLowerCase()
      .split(/[^a-zà-ÿ0-9]+/)
      .filter((w) => w.length > 3);
    priors.push({
      videoId: job.video.id,
      title: job.video.title ?? job.video.originalFilename ?? "Vidéo",
      durationSec: job.video.durationSec ?? result.video.durationSec ?? 0,
      hookWords,
      hookText,
      structureKinds: (result.enriched?.structure?.segments ?? []).map((s) => s.kind),
      performance: null,
      youtubeVideoId: job.video.youtubeVideoId,
    });
  }
  return priors;
}
