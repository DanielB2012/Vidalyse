import { prisma } from "@/lib/prisma";
import { fetchSingleVideoStats, type SingleVideoStats } from "@/lib/youtube/analytics";
import type { MergedAnalysis } from "@/lib/pipeline/types";
import { compareWithChannel } from "./youtubeComparison";
import { cosineSim, embed, isEmbeddingModelInstalled } from "./semantic";
import { loadChannelPriors } from "./priors";
import type { ChannelComparison } from "./types";

const STATS_TTL_MS = 6 * 60 * 60 * 1000; // §6 — don't re-hit YouTube on every open

async function getCachedStats(userId: string, youtubeVideoId: string): Promise<SingleVideoStats | null> {
  const row = await prisma.videoStatsCache.findUnique({
    where: { userId_youtubeVideoId: { userId, youtubeVideoId } },
  });
  if (row && Date.now() - row.fetchedAt.getTime() < STATS_TTL_MS) {
    return row.payload as unknown as SingleVideoStats;
  }
  const fresh = await fetchSingleVideoStats(userId, youtubeVideoId).catch(() => null);
  if (fresh) {
    await prisma.videoStatsCache
      .upsert({
        where: { userId_youtubeVideoId: { userId, youtubeVideoId } },
        create: { userId, youtubeVideoId, payload: fresh as object },
        update: { payload: fresh as object, fetchedAt: new Date() },
      })
      .catch(() => {});
    return fresh;
  }
  return row ? (row.payload as unknown as SingleVideoStats) : null; // stale beats nothing
}

// On-demand comparison (§6/§7): recompute against the channel corpus, optionally
// re-rank hook similarity with local embeddings, and attach REAL YouTube
// performance (cached) for every linked match.
export async function computeComparisonWithPerf(
  userId: string,
  videoId: string,
  targetResult: MergedAnalysis
): Promise<ChannelComparison> {
  const priors = await loadChannelPriors(userId, videoId);

  const targetHookText = (targetResult.transcript ?? [])
    .filter((s) => s.timestampMs < 15000)
    .map((s) => s.text.trim())
    .join(" ")
    .trim();
  const targetHookWords = targetHookText
    .toLowerCase()
    .split(/[^a-zà-ÿ0-9]+/)
    .filter((w) => w.length > 3);

  const base = compareWithChannel({
    target: {
      durationSec: targetResult.video.durationSec || 0,
      hookWords: targetHookWords,
      hookText: targetHookText,
      structureKinds: (targetResult.enriched?.structure?.segments ?? []).map((s) => s.kind),
    },
    priors,
  });

  if (!base.available) return base;

  const priorById = new Map(priors.map((p) => [p.videoId, p]));

  // --- semantic re-rank (§7) ---
  let method: ChannelComparison["method"] = base.method;
  if (isEmbeddingModelInstalled() && targetHookText.length > 10) {
    const texts = [targetHookText, ...base.matches.map((m) => priorById.get(m.videoId)?.hookText ?? "")];
    const vecs = await embed(texts);
    if (vecs && vecs.length === texts.length) {
      const tv = vecs[0];
      base.matches = base.matches
        .map((m, i) => {
          const sim = cosineSim(tv, vecs[i + 1]);
          const blended = Number((0.55 * sim + 0.45 * m.similarity).toFixed(3));
          const traits =
            sim > 0.55
              ? [...new Set([...m.sharedTraits.filter((t) => !t.includes("hook")), "hook sémantiquement proche"])]
              : m.sharedTraits;
          return { ...m, similarity: blended, sharedTraits: traits };
        })
        .sort((a, b) => b.similarity - a.similarity);
      method = "semantique";
    }
  }

  // --- attach real YouTube performance (cached) ---
  for (const m of base.matches) {
    const yt = priorById.get(m.videoId)?.youtubeVideoId ?? null;
    if (!yt) {
      m.performanceDetail = null;
      continue;
    }
    const s = await getCachedStats(userId, yt);
    if (!s) {
      m.performanceDetail = null;
      continue;
    }
    m.performanceDetail = {
      views: s.viewCount,
      likes: s.likeCount,
      comments: s.commentCount,
      estimatedMinutesWatched: s.estimatedMinutesWatched,
      averageViewDurationSec: s.averageViewDurationSec,
      averageViewPercentage: s.averageViewPercentage,
      subscribersGained: s.subscribersGained,
    };
    m.performance = { views: s.viewCount, avgViewPercentage: s.averageViewPercentage };
  }

  return {
    ...base,
    method,
    note:
      (base.note ?? "") +
      (method === "semantique"
        ? " Similarité du hook calculée par embeddings locaux (MiniLM)."
        : " Similarité du hook lexicale (Jaccard) — installe le modèle d'embeddings pour une comparaison plus fine."),
  };
}
