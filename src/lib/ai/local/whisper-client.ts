import fs from "node:fs";
import path from "node:path";
import { STORAGE_ROOT } from "@/lib/media/paths";
import type { TranscriptSegment } from "@/lib/pipeline/types";

// Local speech-to-text (spec §14 — real, offline, free). Whisper runs
// in-process via @huggingface/transformers (ONNX / onnxruntime-node): no
// API key, no Python, no external service. Model files are downloaded once
// from the Hugging Face hub and cached on disk under storage/.
export const WHISPER_CACHE_DIR = path.join(STORAGE_ROOT, "models", "transformers");

const DTYPE = "q8" as const; // quantised — ~3-5x smaller download, minor accuracy cost

type AsrPipeline = (
  audio: Float32Array,
  opts: Record<string, unknown>
) => Promise<{ text?: string; chunks?: { text: string; timestamp: [number, number | null] }[] }>;

type ProgressEvent = { status: string; file?: string; progress?: number };

async function loadTransformers() {
  const mod = await import("@huggingface/transformers");
  mod.env.cacheDir = WHISPER_CACHE_DIR;
  return mod;
}

// Where transformers.js stores a model: {cacheDir}/{repoId}/... (slash kept).
function modelDir(runtimeModelId: string): string {
  return path.join(WHISPER_CACHE_DIR, ...runtimeModelId.split("/"));
}

export function isWhisperModelInstalled(runtimeModelId: string): boolean {
  const dir = modelDir(runtimeModelId);
  return fs.existsSync(path.join(dir, "config.json")) && fs.existsSync(path.join(dir, "onnx"));
}

export async function removeWhisperModel(runtimeModelId: string): Promise<void> {
  await fs.promises.rm(modelDir(runtimeModelId), { recursive: true, force: true });
}

// Downloads + caches the model (and warms it once so a broken download fails
// here, at install time, not mid-analysis). `onProgress` gets 0-100.
export async function downloadWhisperModel(
  runtimeModelId: string,
  onProgress?: (percent: number) => void
): Promise<void> {
  const { pipeline, env } = await loadTransformers();
  env.allowRemoteModels = true;
  await fs.promises.mkdir(WHISPER_CACHE_DIR, { recursive: true });
  const pipe = await pipeline("automatic-speech-recognition", runtimeModelId, {
    dtype: DTYPE,
    progress_callback: (p: ProgressEvent) => {
      if (p.status === "progress" && typeof p.progress === "number") {
        onProgress?.(Math.max(0, Math.min(100, Math.round(p.progress))));
      }
    },
  });
  // free the memory — the pipeline is rebuilt lazily when transcription runs
  await (pipe as unknown as { dispose?: () => Promise<void> }).dispose?.();
}

const pipelineCache = new Map<string, Promise<AsrPipeline>>();

async function getAsrPipeline(runtimeModelId: string): Promise<AsrPipeline> {
  let p = pipelineCache.get(runtimeModelId);
  if (!p) {
    p = (async () => {
      const { pipeline, env } = await loadTransformers();
      env.allowRemoteModels = false; // must already be installed
      return (await pipeline("automatic-speech-recognition", runtimeModelId, {
        dtype: DTYPE,
      })) as unknown as AsrPipeline;
    })();
    pipelineCache.set(runtimeModelId, p);
  }
  return p;
}

// Reads a 16 kHz mono PCM-s16le WAV (what extractAudio() produces) into the
// Float32 [-1, 1] mono array transformers.js expects.
function decodeWav16kMono(filePath: string): Float32Array {
  const buf = fs.readFileSync(filePath);
  let offset = 12; // skip "RIFF"<size>"WAVE"
  while (offset + 8 <= buf.length) {
    const chunkId = buf.toString("ascii", offset, offset + 4);
    const chunkSize = buf.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (chunkId === "data") {
      const bytes = new Uint8Array(buf.subarray(body, body + chunkSize)); // aligned copy
      const pcm = new Int16Array(bytes.buffer, 0, bytes.length >> 1);
      const out = new Float32Array(pcm.length);
      for (let i = 0; i < pcm.length; i++) out[i] = pcm[i] / 32768;
      return out;
    }
    offset = body + chunkSize + (chunkSize % 2);
  }
  throw new Error("Fichier WAV invalide : chunk 'data' introuvable.");
}

export async function transcribeLocal(
  audioPath: string,
  runtimeModelId: string,
  language = "french"
): Promise<TranscriptSegment[]> {
  const asr = await getAsrPipeline(runtimeModelId);
  const audio = decodeWav16kMono(audioPath);
  const result = await asr(audio, {
    return_timestamps: true,
    chunk_length_s: 30,
    stride_length_s: 5,
    // Force the language: on short clips whisper-tiny/base otherwise
    // mis-detects and transcribes French audio as broken English.
    language,
    task: "transcribe",
  });
  const chunks = result.chunks ?? [];
  return chunks
    .map((c) => {
      const startMs = Math.round((c.timestamp[0] ?? 0) * 1000);
      return {
        timestampMs: startMs,
        endTimestampMs: c.timestamp[1] != null ? Math.round(c.timestamp[1] * 1000) : startMs,
        text: c.text.trim(),
      };
    })
    .filter((s) => s.text.length > 0);
}
