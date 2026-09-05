import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getModel } from "@/lib/ai/providers/registry";
import { deleteOllamaModel } from "@/lib/ai/local/ollama-client";
import { removeWhisperModel } from "@/lib/ai/local/whisper-client";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const { providerId } = (await req.json()) as { providerId?: string };
  const model = providerId ? getModel(providerId) : undefined;

  if (!model || model.mode !== "LOCAL" || !model.runtimeModelId) {
    return NextResponse.json({ error: "Modèle local invalide." }, { status: 400 });
  }

  const isOllama = model.runtime === "ollama-text" || model.runtime === "ollama-vision";
  const isWhisper = model.runtime === "whisper-local";
  if (!isOllama && !isWhisper) {
    return NextResponse.json({ error: "Ce type de modèle local ne se désinstalle pas ici." }, { status: 400 });
  }

  try {
    if (isWhisper) {
      await removeWhisperModel(model.runtimeModelId);
    } else {
      await deleteOllamaModel(model.runtimeModelId);
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: `Échec de la désinstallation : ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 }
    );
  }
}
