import { getModel } from "@/lib/ai/providers/registry";
import { runOllamaSetup } from "./ollama-installer";
import { downloadWhisperModel } from "./whisper-client";

// Fire-and-forget local-model install, for callers that can't stream progress
// (Lyra's chat). The Settings UI still shows progress for installs it starts
// itself; a background install just flips to "Installé" on the next page load.
// There is deliberately NO matching background *uninstall* helper.

const inFlight = new Set<string>();

export type StartInstallResult =
  | { ok: true; alreadyRunning: boolean }
  | { ok: false; error: "invalid_model" | "not_installable" };

export function startLocalModelInstall(providerId: string): StartInstallResult {
  const model = getModel(providerId);
  if (!model || model.mode !== "LOCAL" || !model.runtimeModelId) {
    return { ok: false, error: "invalid_model" };
  }
  const runtimeModelId = model.runtimeModelId;
  const isOllama = model.runtime === "ollama-text" || model.runtime === "ollama-vision";
  const isWhisper = model.runtime === "whisper-local";
  if (!isOllama && !isWhisper) return { ok: false, error: "not_installable" };

  if (inFlight.has(providerId)) return { ok: true, alreadyRunning: true };
  inFlight.add(providerId);

  const done = () => inFlight.delete(providerId);
  if (isWhisper) {
    void downloadWhisperModel(runtimeModelId)
      .catch((err) => console.error("[lyra install whisper]", err))
      .finally(done);
  } else {
    void (async () => {
      try {
        for await (const _progress of runOllamaSetup(runtimeModelId)) {
          void _progress;
        }
      } catch (err) {
        console.error("[lyra install ollama]", err);
      } finally {
        done();
      }
    })();
  }
  return { ok: true, alreadyRunning: false };
}
