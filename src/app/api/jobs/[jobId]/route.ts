import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function GET(_req: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const { jobId } = await params;

  const job = await prisma.analysisJob.findUnique({
    where: { id: jobId },
    include: { logs: { orderBy: { createdAt: "asc" } } },
  });

  if (!job || job.userId !== session.user.id) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({
    id: job.id,
    status: job.status,
    currentStage: job.currentStage,
    progress: job.progress,
    error: job.error,
    result: job.result,
    createdAt: job.createdAt,
    logs: job.logs.map((l) => ({
      stage: l.stage,
      status: l.status,
      message: l.message,
      createdAt: l.createdAt,
    })),
  });
}
