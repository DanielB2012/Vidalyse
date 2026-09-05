import { execFile } from "node:child_process";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";
import { prisma } from "@/lib/prisma";
import { getGeminiKeySource } from "@/lib/ai/gemini-key";
import { isOllamaReachable, listInstalledOllamaModels } from "@/lib/ai/local/ollama-client";
import { isWhisperModelInstalled } from "@/lib/ai/local/whisper-client";
import { isEmbeddingModelInstalled } from "@/lib/analysis/semantic";
import { getModelCatalog } from "@/lib/ai/providers/registry";
import { getT } from "@/i18n/server";

const execFileAsync = promisify(execFile);

type TFn = (key: string, vars?: Record<string, string | number>) => string;

export type DiagnosticStatus = "ok" | "not_configured" | "not_installed" | "unavailable" | "error";

export interface DiagnosticItem {
  key: string;
  label: string;
  status: DiagnosticStatus;
  /** Human-readable — NEVER contains an API key or secret. */
  detail: string;
  hint?: string;
}

const FFMPEG_BIN = ffmpegPath as unknown as string;

async function checkBinary(bin: string, args: string[]): Promise<{ ok: boolean; line: string }> {
  try {
    const { stdout, stderr } = await execFileAsync(bin, args, { timeout: 8000 });
    const line = (stdout || stderr).split("\n")[0]?.trim() ?? "";
    return { ok: true, line };
  } catch (err) {
    return { ok: false, line: err instanceof Error ? err.message.split("\n")[0] : String(err) };
  }
}

async function checkGemini(t: TFn): Promise<DiagnosticItem> {
  const source = await getGeminiKeySource();
  if (!source) {
    return {
      key: "gemini",
      label: t("diag.geminiLabel"),
      status: "not_configured",
      detail: t("diag.geminiNone"),
      hint: t("diag.geminiHint"),
    };
  }
  // Key present. A live call would consume quota, so we only confirm the key is
  // wired up — never echo any part of it.
  return {
    key: "gemini",
    label: t("diag.geminiLabel"),
    status: "ok",
    detail: source === "env" ? t("diag.geminiEnv") : t("diag.geminiApp"),
  };
}

async function checkOllama(t: TFn): Promise<DiagnosticItem> {
  const reachable = await isOllamaReachable();
  if (!reachable) {
    return {
      key: "ollama",
      label: t("diag.ollamaLabel"),
      status: "unavailable",
      detail: t("diag.ollamaDown"),
      hint: t("diag.ollamaHint"),
    };
  }
  const models = await listInstalledOllamaModels();
  return {
    key: "ollama",
    label: t("diag.ollamaLabel"),
    status: "ok",
    detail: models.length ? t("diag.ollamaOkCount", { count: models.length }) : t("diag.ollamaOkNone"),
    hint: models.length ? undefined : t("diag.ollamaHintDownload"),
  };
}

function checkWhisper(t: TFn): DiagnosticItem {
  const whisperModels = getModelCatalog().filter((m) => m.runtime === "whisper-local" && m.runtimeModelId);
  const installed = whisperModels.filter((m) => isWhisperModelInstalled(m.runtimeModelId!));
  if (installed.length === 0) {
    return {
      key: "whisper",
      label: t("diag.whisperLabel"),
      status: "not_installed",
      detail: t("diag.whisperNone"),
      hint: t("diag.whisperHint"),
    };
  }
  return {
    key: "whisper",
    label: t("diag.whisperLabel"),
    status: "ok",
    detail: t("diag.whisperOk", {
      count: installed.length,
      names: installed.map((m) => m.label).join(", "),
    }),
  };
}

function checkEmbeddings(t: TFn): DiagnosticItem {
  const ok = isEmbeddingModelInstalled();
  return {
    key: "embeddings",
    label: t("diag.embeddingsLabel"),
    status: ok ? "ok" : "not_installed",
    detail: ok ? t("diag.embeddingsOk") : t("diag.embeddingsMissing"),
    hint: ok ? undefined : t("diag.embeddingsHint"),
  };
}

async function checkFfmpeg(t: TFn): Promise<DiagnosticItem> {
  const [ff, fp] = await Promise.all([
    checkBinary(FFMPEG_BIN, ["-version"]),
    checkBinary(ffprobeStatic.path, ["-version"]),
  ]);
  if (ff.ok && fp.ok) {
    return {
      key: "ffmpeg",
      label: t("diag.ffmpegLabel"),
      status: "ok",
      detail: ff.line || t("diag.ffmpegOk"),
    };
  }
  return {
    key: "ffmpeg",
    label: t("diag.ffmpegLabel"),
    status: "error",
    detail: t("diag.ffmpegError", { detail: ff.ok ? fp.line : ff.line }),
    hint: t("diag.ffmpegHint"),
  };
}

async function checkYtDlp(t: TFn): Promise<DiagnosticItem> {
  try {
    const mod = (await import("youtube-dl-exec")).default as unknown as (
      url: string,
      flags: Record<string, unknown>
    ) => Promise<string>;
    const out = await mod("--version", {});
    return {
      key: "ytdlp",
      label: t("diag.ytdlpLabel"),
      status: "ok",
      detail: t("diag.ytdlpVersion", { version: String(out).trim().split("\n")[0] }),
    };
  } catch (err) {
    return {
      key: "ytdlp",
      label: t("diag.ytdlpLabel"),
      status: "error",
      detail: err instanceof Error ? err.message.split("\n")[0] : String(err),
      hint: t("diag.ytdlpHint"),
    };
  }
}

async function checkDatabase(t: TFn): Promise<DiagnosticItem> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { key: "database", label: t("diag.dbLabel"), status: "ok", detail: t("diag.dbOk") };
  } catch (err) {
    return {
      key: "database",
      label: t("diag.dbLabel"),
      status: "error",
      detail: err instanceof Error ? err.message.split("\n")[0] : String(err),
      hint: t("diag.dbHint"),
    };
  }
}

// Aggregated environment diagnostic for Settings (§1). Every check degrades to
// a clear status + actionable hint; nothing here can leak a secret.
export async function runDiagnostics(): Promise<{ generatedAt: string; items: DiagnosticItem[] }> {
  const { t } = await getT();
  const items = await Promise.all([
    checkGemini(t),
    checkOllama(t),
    Promise.resolve(checkWhisper(t)),
    Promise.resolve(checkEmbeddings(t)),
    checkFfmpeg(t),
    checkYtDlp(t),
    checkDatabase(t),
  ]);
  return { generatedAt: new Date().toISOString(), items };
}
