import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { startAnalysisJob } from "@/lib/pipeline/startAnalysisJob";

export async function POST(_req: Request, { params }: { params: Promise<{ videoId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const { videoId } = await params;

  const result = await startAnalysisJob(session.user.id, videoId);
  if (!result.ok) {
    const status = result.error === "not_found" ? 404 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({ jobId: result.jobId, reused: result.reused, videoId });
}
