import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { loadLatestResult } from "@/lib/analysis/loadResult";
import { computeComparisonWithPerf } from "@/lib/analysis/comparisonOnDemand";

// On-demand channel comparison with real (cached) YouTube performance and, when
// the local embedding model is installed, semantic hook similarity (§6/§7).
export async function POST(_req: Request, { params }: { params: Promise<{ videoId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const { videoId } = await params;

  const loaded = await loadLatestResult(session.user.id, videoId);
  if (loaded.error) {
    if (loaded.error === "not_found") return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json(
      { error: "Aucune analyse terminée pour cette vidéo." },
      { status: 409 }
    );
  }

  try {
    const comparison = await computeComparisonWithPerf(session.user.id, videoId, loaded.result);
    return NextResponse.json(comparison, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json(
      { error: "La comparaison n'a pas pu être calculée.", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
