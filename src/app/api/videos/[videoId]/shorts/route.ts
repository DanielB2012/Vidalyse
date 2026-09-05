import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { loadLatestResult } from "@/lib/analysis/loadResult";
import { proposeShorts } from "@/lib/analysis/shortsExtraction";

export async function POST(req: Request, { params }: { params: Promise<{ videoId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const { videoId } = await params;

  const body = (await req.json().catch(() => ({}))) as { count?: number | null; targetDurationSec?: number };
  const count =
    body.count === null || body.count === undefined
      ? null
      : Math.max(1, Math.min(20, Math.round(Number(body.count) || 1)));
  const targetDurationSec = Math.max(5, Math.min(90, Math.round(Number(body.targetDurationSec) || 30)));

  const loaded = await loadLatestResult(session.user.id, videoId);
  if (loaded.error) {
    if (loaded.error === "not_found") return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json(
      { error: "Cette vidéo n'a pas encore d'analyse terminée. Lance l'analyse d'abord." },
      { status: 409 }
    );
  }

  const { result } = loaded;
  const durationMs = Math.round((result.video.durationSec || 0) * 1000);
  const sceneDetection = result.enriched?.sceneDetection ?? null;

  const shorts = proposeShorts({
    durationMs,
    targetDurationSec,
    count,
    transcript: result.transcript,
    scoring: {
      durationMs,
      transcript: result.transcript,
      visionEvents: result.visionEvents,
      audioDsp: result.audioDsp,
      sceneDetection,
    },
  });

  return NextResponse.json(shorts);
}
