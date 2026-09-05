import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  downloadEmbeddingModel,
  isEmbeddingModelInstalled,
  removeEmbeddingModel,
  EMBEDDING_MODEL_ID,
} from "@/lib/analysis/semantic";

// Install / remove the local sentence-embedding model used for semantic hook
// similarity (§7). Free, offline, ~90 MB. Optional — comparison works without it
// (lexical fallback).
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const { action } = (await req.json().catch(() => ({}))) as { action?: string };

  try {
    if (action === "remove") {
      await removeEmbeddingModel();
      return NextResponse.json({ installed: false });
    }
    if (!isEmbeddingModelInstalled()) {
      await downloadEmbeddingModel();
    }
    return NextResponse.json({ installed: isEmbeddingModelInstalled(), model: EMBEDDING_MODEL_ID });
  } catch (err) {
    return NextResponse.json(
      { error: `Échec : ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 }
    );
  }
}
