import fs from "node:fs";
import path from "node:path";
import { STORAGE_ROOT } from "@/lib/media/paths";

// Local, free sentence-embedding model for semantic similarity (§7). Same
// transformers.js runtime and on-disk cache convention as local Whisper — no
// API, no key, fully offline. Never auto-downloaded during an analysis: if the
// model isn't present, callers fall back to lexical (Jaccard) similarity.
export const EMBEDDING_MODEL_ID = "Xenova/all-MiniLM-L6-v2";
const CACHE_DIR = path.join(STORAGE_ROOT, "models", "transformers");
const DTYPE = "q8" as const;

function modelDir(id: string): string {
  return path.join(CACHE_DIR, ...id.split("/"));
}

export function isEmbeddingModelInstalled(): boolean {
  const dir = modelDir(EMBEDDING_MODEL_ID);
  return fs.existsSync(path.join(dir, "config.json")) && fs.existsSync(path.join(dir, "onnx"));
}

export function embeddingModelDiskName(): string {
  return EMBEDDING_MODEL_ID;
}

type ProgressEvent = { status: string; progress?: number };
type FeatureExtractor = (
  text: string | string[],
  opts: Record<string, unknown>
) => Promise<{ tolist: () => number[][] }>;

async function loadTransformers() {
  const mod = await import("@huggingface/transformers");
  mod.env.cacheDir = CACHE_DIR;
  return mod;
}

let extractorPromise: Promise<FeatureExtractor> | null = null;

async function getExtractor(): Promise<FeatureExtractor> {
  if (!extractorPromise) {
    extractorPromise = (async () => {
      const { pipeline, env } = await loadTransformers();
      env.allowRemoteModels = false; // must already be installed
      return (await pipeline("feature-extraction", EMBEDDING_MODEL_ID, {
        dtype: DTYPE,
      })) as unknown as FeatureExtractor;
    })();
  }
  return extractorPromise;
}

export async function downloadEmbeddingModel(onProgress?: (percent: number) => void): Promise<void> {
  const { pipeline, env } = await loadTransformers();
  env.allowRemoteModels = true;
  await fs.promises.mkdir(CACHE_DIR, { recursive: true });
  const pipe = await pipeline("feature-extraction", EMBEDDING_MODEL_ID, {
    dtype: DTYPE,
    progress_callback: (p: ProgressEvent) => {
      if (p.status === "progress" && typeof p.progress === "number") {
        onProgress?.(Math.max(0, Math.min(100, Math.round(p.progress))));
      }
    },
  });
  await (pipe as unknown as { dispose?: () => Promise<void> }).dispose?.();
  extractorPromise = null;
}

export async function removeEmbeddingModel(): Promise<void> {
  await fs.promises.rm(modelDir(EMBEDDING_MODEL_ID), { recursive: true, force: true });
  extractorPromise = null;
}

// Returns L2-normalised mean-pooled embeddings, or null when the model isn't
// installed (caller then uses the lexical fallback).
export async function embed(texts: string[]): Promise<number[][] | null> {
  const cleaned = texts.map((t) => t.trim()).filter((t) => t.length > 0);
  if (cleaned.length === 0) return null;
  if (!isEmbeddingModelInstalled()) return null;
  try {
    const extractor = await getExtractor();
    const output = await extractor(cleaned, { pooling: "mean", normalize: true });
    return output.tolist();
  } catch {
    return null;
  }
}

export function cosineSim(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}
