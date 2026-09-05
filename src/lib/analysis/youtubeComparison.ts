import type { ChannelComparison, ChannelComparisonMatch } from "./types";

export interface ComparableVideo {
  videoId: string;
  title: string;
  durationSec: number;
  /** first-15s words, lowercased, from the transcript. */
  hookWords: string[];
  /** raw first-15s text — used by the optional semantic (embeddings) path. */
  hookText: string;
  /** ordered structure kinds, e.g. ["hook","intro","developpement","outro"]. */
  structureKinds: string[];
  performance: { views: number | null; avgViewPercentage: number | null } | null;
}

export interface ComparisonInput {
  target: Omit<ComparableVideo, "videoId" | "title" | "performance">;
  priors: ComparableVideo[];
}

function jaccard(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const sa = new Set(a);
  const sb = new Set(b);
  let inter = 0;
  sa.forEach((x) => sb.has(x) && inter++);
  return inter / (sa.size + sb.size - inter);
}

function sequenceSimilarity(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const sa = new Set(a);
  const sb = new Set(b);
  let inter = 0;
  sa.forEach((x) => sb.has(x) && inter++);
  return inter / Math.max(sa.size, sb.size);
}

// Compares a video to the creator's OWN previously analysed videos (§14).
// Deliberately never generalises beyond this channel's data.
export function compareWithChannel(input: ComparisonInput): ChannelComparison {
  if (input.priors.length < 2) {
    return {
      available: false,
      reason: `Comparaison indisponible : il faut au moins 2 autres vidéos analysées sur cette chaîne (actuellement ${input.priors.length}).`,
      basisCount: input.priors.length,
      matches: [],
      method: "lexical",
      note: null,
    };
  }

  const matches: ChannelComparisonMatch[] = input.priors
    .map((p) => {
      const durRatio =
        Math.min(p.durationSec, input.target.durationSec) /
        Math.max(p.durationSec, input.target.durationSec || 1);
      const durSim = durRatio; // 1 = identical length
      const hookSim = jaccard(input.target.hookWords, p.hookWords);
      const structSim = sequenceSimilarity(input.target.structureKinds, p.structureKinds);

      const similarity = Number((0.4 * durSim + 0.35 * hookSim + 0.25 * structSim).toFixed(3));

      const sharedTraits: string[] = [];
      if (durSim > 0.8) sharedTraits.push("durée proche");
      if (hookSim > 0.25) sharedTraits.push("hook lexicalement proche");
      if (structSim > 0.6) sharedTraits.push("structure proche");

      return {
        videoId: p.videoId,
        title: p.title,
        similarity,
        sharedTraits,
        performance: p.performance,
      } satisfies ChannelComparisonMatch;
    })
    .filter((m) => m.similarity >= 0.35 && m.sharedTraits.length > 0)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 5);

  return {
    available: matches.length > 0,
    reason: matches.length ? null : "Aucune ancienne vidéo suffisamment proche de celle-ci.",
    basisCount: input.priors.length,
    matches,
    method: "lexical",
    note:
      "Comparaison basée uniquement sur les vidéos de cette chaîne (durée, lexique du hook, structure). Les performances affichées viennent de l'API YouTube quand la vidéo y est liée.",
  };
}
