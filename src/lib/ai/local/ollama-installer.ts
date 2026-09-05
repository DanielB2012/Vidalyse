import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { isOllamaReachable } from "./ollama-client";

const execFileAsync = promisify(execFile);

// Real installer, verified before writing this code (spec §106):
// - Direct download URL confirmed live on ollama.com/download/windows.
// - InstallerType is "inno" per the official winget-pkgs manifest for
//   Ollama, which means the standard Inno Setup silent switches apply.
// - Ollama's Windows installer installs per-user (like Discord/VS Code) —
//   no admin elevation / UAC prompt required, and it starts the background
//   server automatically once installed.
const OLLAMA_INSTALLER_URL = "https://ollama.com/download/OllamaSetup.exe";
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";

export type InstallProgress =
  | { stage: "checking" }
  | { stage: "already_installed" }
  | { stage: "downloading_ollama"; percent: number | null }
  | { stage: "installing_ollama" }
  | { stage: "waiting_for_daemon" }
  | { stage: "pulling_model"; status: string; percent: number | null }
  | { stage: "done" }
  | { stage: "error"; message: string };

export async function* runOllamaSetup(model: string): AsyncGenerator<InstallProgress> {
  yield { stage: "checking" };

  if (!(await isOllamaReachable())) {
    try {
      const installerPath = path.join(os.tmpdir(), "OllamaSetup.exe");
      for await (const percent of downloadFile(OLLAMA_INSTALLER_URL, installerPath)) {
        yield { stage: "downloading_ollama", percent };
      }

      yield { stage: "installing_ollama" };
      await execFileAsync(installerPath, ["/VERYSILENT", "/SUPPRESSMSGBOXES", "/NORESTART"], {
        timeout: 180_000,
      });

      yield { stage: "waiting_for_daemon" };
      const ready = await waitFor(() => isOllamaReachable(), 45_000, 1500);
      if (!ready) {
        yield {
          stage: "error",
          message:
            "Ollama a été installé mais ne répond pas encore sur localhost:11434. Réessaie dans une minute, ou vérifie qu'il n'a pas besoin d'un redémarrage.",
        };
        return;
      }
    } catch (err) {
      yield {
        stage: "error",
        message: `Échec de l'installation d'Ollama : ${err instanceof Error ? err.message : String(err)}`,
      };
      return;
    }
  } else {
    yield { stage: "already_installed" };
  }

  try {
    for await (const progress of pullModel(model)) {
      yield progress;
    }
    yield { stage: "done" };
  } catch (err) {
    yield {
      stage: "error",
      message: `Échec du téléchargement du modèle "${model}" : ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

async function* downloadFile(url: string, destPath: string): AsyncGenerator<number | null> {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`Téléchargement échoué (HTTP ${res.status}).`);

  const total = Number(res.headers.get("content-length") ?? 0);
  let downloaded = 0;
  const fileHandle = await fs.open(destPath, "w");

  try {
    for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
      await fileHandle.write(chunk);
      downloaded += chunk.length;
      yield total > 0 ? Math.round((downloaded / total) * 100) : null;
    }
  } finally {
    await fileHandle.close();
  }
}

interface OllamaPullChunk {
  status: string;
  completed?: number;
  total?: number;
  error?: string;
}

async function* pullModel(model: string): AsyncGenerator<InstallProgress> {
  const res = await fetch(`${OLLAMA_BASE_URL}/api/pull`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: model, stream: true }),
  });

  if (!res.ok || !res.body) throw new Error(`Ollama a répondu avec le statut ${res.status}.`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) continue;
      const chunk = JSON.parse(line) as OllamaPullChunk;
      if (chunk.error) throw new Error(chunk.error);
      const percent =
        chunk.total && chunk.completed ? Math.round((chunk.completed / chunk.total) * 100) : null;
      yield { stage: "pulling_model", status: chunk.status, percent };
    }
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(check: () => Promise<boolean>, timeoutMs: number, intervalMs: number) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await check()) return true;
    await sleep(intervalMs);
  }
  return false;
}
