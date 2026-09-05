import { auth } from "@/auth";
import { getModel } from "@/lib/ai/providers/registry";
import { runOllamaSetup } from "@/lib/ai/local/ollama-installer";
import { downloadWhisperModel } from "@/lib/ai/local/whisper-client";

// Streams newline-delimited JSON progress events (spec §18's install flow:
// choix → confirmation → téléchargement → vérification → installation →
// configuration). No AI credit involved — this installs software/models, it
// doesn't call a paid model.
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response(JSON.stringify({ error: "unauthenticated" }), { status: 401 });
  }

  const { providerId } = (await req.json()) as { providerId?: string };
  const model = providerId ? getModel(providerId) : undefined;

  if (!model || model.mode !== "LOCAL" || !model.runtimeModelId) {
    return new Response(JSON.stringify({ error: "Modèle local invalide." }), { status: 400 });
  }

  const isOllama = model.runtime === "ollama-text" || model.runtime === "ollama-vision";
  const isWhisper = model.runtime === "whisper-local";
  if (!isOllama && !isWhisper) {
    return new Response(JSON.stringify({ error: "Ce type de modèle local ne s'installe pas ici." }), {
      status: 400,
    });
  }

  const encoder = new TextEncoder();
  const runtimeModelId = model.runtimeModelId;
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      try {
        if (isWhisper) {
          send({ stage: "checking" });
          send({ stage: "pulling_model", status: `Téléchargement de ${runtimeModelId}`, percent: 0 });
          await downloadWhisperModel(runtimeModelId, (percent) => {
            send({ stage: "pulling_model", status: `Téléchargement de ${runtimeModelId}`, percent });
          });
          send({ stage: "done" });
        } else {
          for await (const progress of runOllamaSetup(runtimeModelId)) {
            send(progress);
          }
        }
      } catch (err) {
        send({ stage: "error", message: err instanceof Error ? err.message : String(err) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-cache" },
  });
}
