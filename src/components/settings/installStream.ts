export type InstallProgress =
  | { stage: "checking" }
  | { stage: "already_installed" }
  | { stage: "downloading_ollama"; percent: number | null }
  | { stage: "installing_ollama" }
  | { stage: "waiting_for_daemon" }
  | { stage: "pulling_model"; status: string; percent: number | null }
  | { stage: "done" }
  | { stage: "error"; message: string };

// Message keys resolved with the i18n `t()` at the call site.
export const INSTALL_STAGE_LABEL: Record<InstallProgress["stage"], string> = {
  checking: "install.checking",
  already_installed: "install.alreadyInstalled",
  downloading_ollama: "install.downloadingOllama",
  installing_ollama: "install.installingOllama",
  waiting_for_daemon: "install.waitingForDaemon",
  pulling_model: "install.pullingModel",
  done: "install.done",
  error: "install.error",
};

type TFn = (key: string, vars?: Record<string, string | number>) => string;

// Streams one model's install (spec flow: choix → confirmation → download →
// install → pull) and reports each progress event as it arrives.
export async function installLocalModel(
  providerId: string,
  onProgress: (p: InstallProgress) => void
): Promise<void> {
  const res = await fetch("/api/local-models/install", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ providerId }),
  });
  if (!res.body) throw new Error("Pas de flux de réponse.");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let lastError: string | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const progress = JSON.parse(line) as InstallProgress;
      if (progress.stage === "error") lastError = progress.message;
      onProgress(progress);
    }
  }

  if (lastError) throw new Error(lastError);
}

// Ollama never reports an ETA itself — this extrapolates one client-side
// from observed progress (elapsed time vs. percent done so far), so it's a
// real estimate from this download's own speed, not a guessed constant.
export function estimateRemaining(
  startedAt: number,
  percent: number | null,
  t: TFn
): string | null {
  if (percent === null || percent <= 0) return null;
  const elapsedMs = Date.now() - startedAt;
  const remainingMs = (elapsedMs / percent) * (100 - percent);
  if (remainingMs < 1500) return t("install.someSeconds");
  const remainingSec = Math.round(remainingMs / 1000);
  if (remainingSec < 60) return t("install.secondsLeft", { s: remainingSec });
  const min = Math.floor(remainingSec / 60);
  const sec = remainingSec % 60;
  return t("install.minLeft", { m: min, s: sec.toString().padStart(2, "0") });
}

export function formatElapsed(startedAt: number, t: TFn): string {
  const elapsedSec = Math.round((Date.now() - startedAt) / 1000);
  if (elapsedSec < 60) return t("install.secondsElapsed", { s: elapsedSec });
  const min = Math.floor(elapsedSec / 60);
  const sec = elapsedSec % 60;
  return t("install.minElapsed", { m: min, s: sec.toString().padStart(2, "0") });
}

export async function uninstallLocalModel(providerId: string): Promise<void> {
  const res = await fetch("/api/local-models/uninstall", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ providerId }),
  });
  const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
  if (!res.ok || !data?.ok) throw new Error(data?.error ?? "Échec de la désinstallation.");
}
