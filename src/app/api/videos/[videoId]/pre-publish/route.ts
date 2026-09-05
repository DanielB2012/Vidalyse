import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { loadLatestResult } from "@/lib/analysis/loadResult";
import { estimatePrePublish } from "@/lib/analysis/prePublishAnalysis";
import { computeComparisonWithPerf } from "@/lib/analysis/comparisonOnDemand";
import { estimatePerformance } from "@/lib/analysis/performanceEstimate";

// "Analyser avant publication" (§10) + performance-estimate architecture (§11).
// Reuses the real analysis already stored for the video. Numeric ranges only
// appear when enough similar own-channel videos with real stats exist.
export async function POST(req: Request, { params }: { params: Promise<{ videoId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const { videoId } = await params;
  const body = (await req.json().catch(() => ({}))) as { title?: string | null };

  const loaded = await loadLatestResult(session.user.id, videoId);
  if (loaded.error) {
    if (loaded.error === "not_found") return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json(
      { error: "Aucune analyse terminée pour cette vidéo. Lance l'analyse d'abord." },
      { status: 409 }
    );
  }

  const { result, video } = loaded;
  const enriched = result.enriched ?? null;
  const title =
    (body.title ?? video.title ?? video.originalFilename ?? null)?.toString().trim() || null;

  // Comparison with real cached perf (needed for the numeric estimate).
  const comparison = await computeComparisonWithPerf(session.user.id, videoId, result).catch(
    () => enriched?.comparison ?? null
  );

  const prePublish = estimatePrePublish({
    durationSec: result.video.durationSec || 0,
    title,
    transcript: result.transcript,
    hook: enriched?.hook ?? null,
    structure: enriched?.structure ?? null,
    highlights: enriched?.highlights ?? null,
    comparison,
  });

  const performance = estimatePerformance({
    durationSec: result.video.durationSec || 0,
    comparison,
    prePublish,
  });

  return NextResponse.json({ prePublish, performance, comparison }, { headers: { "Cache-Control": "no-store" } });
}
