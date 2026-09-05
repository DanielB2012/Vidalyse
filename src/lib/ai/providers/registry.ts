import type { AICategory, ModelEntry, ModelTier } from "./types";
import { hasGeminiKeyInEnv } from "../gemini-key";

// The full model catalog (spec §13/§14/§17). Every entry here must be a real,
// verifiable model/engine. Availability reflects what's ACTUALLY wired up in
// this codebase right now, not what's theoretically possible — per spec §106
// ("ne jamais inventer"), a missing integration is reported as such, never
// simulated. `runtime` tells the dispatcher (text/dispatch.ts, vision/dispatch.ts)
// which real implementation to call — "none" means catalog-only.

// Whether an online (Gemini) model is usable. Sync call sites (getModel,
// resolveModelFor…) only see an environment key; the settings page passes the
// resolved value (env OR the user's in-app key) so its warnings clear once the
// user pastes a key. `availability` is display-only — the real gate is the
// async isTextRuntimeConfigured / isVisionRuntimeConfigured in the dispatchers.
export function getModelCatalog(opts?: { geminiConfigured?: boolean }): ModelEntry[] {
  const geminiConfigured = opts?.geminiConfigured ?? hasGeminiKeyInEnv();
  const geminiAvailability = (): ModelEntry["availability"] =>
    geminiConfigured
      ? { status: "available" }
      : {
          status: "requires_setup",
          reason: "catalog.geminiReason",
        };
  const ollamaReason = "catalog.ollamaReason";
  const whisperReason = "catalog.whisperReason";

  return [
    // ---------- Cloud Text — Gemini (via la clé de l'utilisateur) ----------
    {
      id: "cloud-text-gemini-light",
      category: "TEXT",
      mode: "CLOUD",
      tier: "LIGHT",
      label: "Gemini 3.1 Flash-Lite",
      description: "catalog.textGeminiLight",
      availability: geminiAvailability(),
      runtime: "gemini",
      runtimeModelId: "gemini-3.1-flash-lite",
    },
    {
      id: "cloud-text-gemini-medium",
      category: "TEXT",
      mode: "CLOUD",
      tier: "MEDIUM",
      label: "Gemini 3.5 Flash",
      description: "catalog.textGeminiMedium",
      availability: geminiAvailability(),
      runtime: "gemini",
      runtimeModelId: "gemini-3.5-flash",
    },
    {
      id: "cloud-text-gemini-pro",
      category: "TEXT",
      mode: "CLOUD",
      tier: "PRO",
      label: "Gemini 3.6 Flash",
      description: "catalog.textGeminiPro",
      availability: geminiAvailability(),
      runtime: "gemini",
      runtimeModelId: "gemini-3.6-flash",
    },

    // ---------- Cloud Vision — Gemini (via la clé de l'utilisateur) ----------
    {
      id: "cloud-vision-gemini-light",
      category: "VISION",
      mode: "CLOUD",
      tier: "LIGHT",
      label: "Gemini 3.1 Flash-Lite (Vision)",
      description: "catalog.visionGeminiLight",
      availability: geminiAvailability(),
      runtime: "gemini",
      runtimeModelId: "gemini-3.1-flash-lite",
    },
    {
      id: "cloud-vision-gemini-medium",
      category: "VISION",
      mode: "CLOUD",
      tier: "MEDIUM",
      label: "Gemini 3.5 Flash (Vision)",
      description: "catalog.visionGeminiMedium",
      availability: geminiAvailability(),
      runtime: "gemini",
      runtimeModelId: "gemini-3.5-flash",
    },
    {
      id: "cloud-vision-gemini-pro",
      category: "VISION",
      mode: "CLOUD",
      tier: "PRO",
      label: "Gemini 3.6 Flash (Vision)",
      description: "catalog.visionGeminiPro",
      availability: geminiAvailability(),
      runtime: "gemini",
      runtimeModelId: "gemini-3.6-flash",
    },

    // ---------- Cloud Audio / Transcription / Video ----------
    {
      id: "cloud-audio-medium",
      category: "AUDIO",
      mode: "CLOUD",
      tier: "MEDIUM",
      label: "Cloud Audio (non intégré)",
      description: "catalog.cloudAudioDesc",
      availability: {
        status: "not_integrated",
        reason: "catalog.cloudAudioReason",
      },
      runtime: "none",
    },
    {
      id: "cloud-transcription-medium",
      category: "TRANSCRIPTION",
      mode: "CLOUD",
      tier: "MEDIUM",
      label: "Cloud Transcription (non intégré)",
      description: "catalog.cloudTranscriptionDesc",
      availability: {
        status: "not_integrated",
        reason: "catalog.cloudTranscriptionReason",
      },
      runtime: "none",
    },
    {
      id: "cloud-video-medium",
      category: "VIDEO",
      mode: "CLOUD",
      tier: "MEDIUM",
      label: "Cloud Vidéo (non intégré)",
      description: "catalog.cloudVideoDesc",
      availability: {
        status: "not_integrated",
        reason: "catalog.cloudVideoReason",
      },
      runtime: "none",
    },

    // ---------- Local Text — Ollama (gratuit, tourne sur le PC de l'utilisateur) ----------
    {
      id: "local-text-light",
      category: "TEXT",
      mode: "LOCAL",
      tier: "LIGHT",
      label: "Llama 3.2 3B (Ollama)",
      description: "catalog.localTextLight",
      availability: { status: "requires_setup", reason: ollamaReason },
      runtime: "ollama-text",
      runtimeModelId: "llama3.2:3b",
      local: { diskGB: 2, ramGB: 8, vramGB: 4, engine: "ollama" },
    },
    {
      id: "local-text-medium",
      category: "TEXT",
      mode: "LOCAL",
      tier: "MEDIUM",
      label: "Llama 3.1 8B (Ollama)",
      description: "catalog.localTextMedium",
      availability: { status: "requires_setup", reason: ollamaReason },
      runtime: "ollama-text",
      runtimeModelId: "llama3.1:8b",
      local: { diskGB: 5, ramGB: 16, vramGB: 8, engine: "ollama" },
    },
    {
      id: "local-text-pro",
      category: "TEXT",
      mode: "LOCAL",
      tier: "PRO",
      label: "Qwen 2.5 32B (Ollama)",
      description: "catalog.localTextPro",
      availability: { status: "requires_setup", reason: ollamaReason },
      runtime: "ollama-text",
      runtimeModelId: "qwen2.5:32b",
      local: { diskGB: 20, ramGB: 32, vramGB: 24, engine: "ollama" },
    },

    // ---------- Local Vision — Ollama vision models (gratuit) ----------
    {
      id: "local-vision-light",
      category: "VISION",
      mode: "LOCAL",
      tier: "LIGHT",
      label: "Moondream 2 (Ollama)",
      description: "catalog.localVisionLight",
      availability: { status: "requires_setup", reason: ollamaReason },
      runtime: "ollama-vision",
      runtimeModelId: "moondream",
      local: { diskGB: 2, ramGB: 8, vramGB: 4, engine: "ollama" },
    },
    {
      id: "local-vision-medium",
      category: "VISION",
      mode: "LOCAL",
      tier: "MEDIUM",
      label: "LLaVA 13B (Ollama)",
      description: "catalog.localVisionMedium",
      availability: { status: "requires_setup", reason: ollamaReason },
      runtime: "ollama-vision",
      runtimeModelId: "llava:13b",
      local: { diskGB: 8, ramGB: 16, vramGB: 10, engine: "ollama" },
    },
    {
      id: "local-vision-pro",
      category: "VISION",
      mode: "LOCAL",
      tier: "PRO",
      label: "LLaVA 34B (Ollama)",
      description: "catalog.localVisionPro",
      availability: { status: "requires_setup", reason: ollamaReason },
      runtime: "ollama-vision",
      runtimeModelId: "llava:34b",
      local: { diskGB: 20, ramGB: 32, vramGB: 24, engine: "ollama" },
    },

    // ---------- Local Transcription — Whisper via @huggingface/transformers (ONNX, in-process) ----------
    {
      id: "local-transcription-light",
      category: "TRANSCRIPTION",
      mode: "LOCAL",
      tier: "LIGHT",
      label: "Whisper tiny (local)",
      description: "catalog.whisperTiny",
      availability: { status: "requires_setup", reason: whisperReason },
      runtime: "whisper-local",
      runtimeModelId: "Xenova/whisper-tiny",
      local: { diskGB: 1, ramGB: 2, vramGB: 0, engine: "transformers.js" },
    },
    {
      id: "local-transcription-medium",
      category: "TRANSCRIPTION",
      mode: "LOCAL",
      tier: "MEDIUM",
      label: "Whisper base (local)",
      description: "catalog.whisperBase",
      availability: { status: "requires_setup", reason: whisperReason },
      runtime: "whisper-local",
      runtimeModelId: "Xenova/whisper-base",
      local: { diskGB: 1, ramGB: 2, vramGB: 0, engine: "transformers.js" },
    },
    {
      id: "local-transcription-pro",
      category: "TRANSCRIPTION",
      mode: "LOCAL",
      tier: "PRO",
      label: "Whisper small (local)",
      description: "catalog.whisperSmall",
      availability: { status: "requires_setup", reason: whisperReason },
      runtime: "whisper-local",
      runtimeModelId: "Xenova/whisper-small",
      local: { diskGB: 1, ramGB: 3, vramGB: 0, engine: "transformers.js" },
    },

    // ---------- Local Audio / Video — not integrated ----------
    {
      id: "local-audio-medium",
      category: "AUDIO",
      mode: "LOCAL",
      tier: "MEDIUM",
      label: "Analyse audio locale (non intégré)",
      description: "catalog.localAudioDesc",
      availability: {
        status: "not_integrated",
        reason: "catalog.localAudioReason",
      },
      runtime: "none",
    },
    {
      id: "local-video-medium",
      category: "VIDEO",
      mode: "LOCAL",
      tier: "MEDIUM",
      label: "Vidéo locale (non intégré)",
      description: "catalog.localVideoDesc",
      availability: {
        status: "not_integrated",
        reason: "catalog.localVideoReason",
      },
      runtime: "none",
    },
  ];
}

export function getModel(id: string): ModelEntry | undefined {
  return getModelCatalog().find((m) => m.id === id);
}

// A saved preference can point at a model that no longer exists in the catalog
// (e.g. the removed paid Claude entries) or at a catalog-only placeholder that
// can't actually run (runtime "none", e.g. the old Cloud transcription stub).
// In both cases fall back to the runnable category default.
export function resolveModelFor(category: AICategory, preferredId?: string | null): ModelEntry {
  const found = preferredId ? getModel(preferredId) : undefined;
  if (found && found.category === category && found.runtime !== "none") return found;
  return defaultModelFor(category);
}

// For CLOUD, several vendors can cover the same category/tier (free Gemini +
// paid Claude) — the pack always picks Gemini, same free-by-default vendor
// as defaultModelFor, so the pack has exactly one deterministic model per
// category/tier instead of an ambiguous choice.
function isPackEntry(m: ModelEntry, mode: ModelEntry["mode"]) {
  if (m.mode !== mode || m.runtime === "none") return false;
  return mode === "LOCAL" || m.runtime === "gemini";
}

// Categories where a real model exists for all three tiers in the given mode:
// TEXT + VISION (LOCAL via Ollama, CLOUD via Gemini) and, for LOCAL only,
// TRANSCRIPTION (Whisper via @huggingface/transformers). These are what the
// simple Light/Medium/Pro "pack" selector can drive. AUDIO (done by ffmpeg
// DSP, no model) and native VIDEO (no verified local model) stay out — never
// invented into a fake pack entry.
export function getPackCategories(mode: ModelEntry["mode"]): AICategory[] {
  const catalog = getModelCatalog();
  const categories: AICategory[] = ["VISION", "AUDIO", "TRANSCRIPTION", "VIDEO", "TEXT"];
  return categories.filter((category) =>
    (["LIGHT", "MEDIUM", "PRO"] as const).every((tier) =>
      catalog.some((m) => m.category === category && m.tier === tier && isPackEntry(m, mode))
    )
  );
}

// The concrete set of models a given tier represents across the pack
// categories — this is "the pack" the user picks with one Light/Medium/Pro
// choice.
export function getPackModels(mode: ModelEntry["mode"], tier: ModelEntry["tier"]): ModelEntry[] {
  const catalog = getModelCatalog();
  return getPackCategories(mode)
    .map((category) => catalog.find((m) => m.category === category && m.tier === tier && isPackEntry(m, mode)))
    .filter((m): m is ModelEntry => Boolean(m));
}

// Highest LOCAL pack tier this PC's RAM can comfortably run (spec's "ne
// jamais inventer" — based only on os.totalmem(), never a guessed/invented
// GPU reading, see src/lib/system/hardware.ts). Returns null if even Light
// exceeds what's available, rather than recommending something dishonest.
export function getRecommendedLocalTier(systemRamGB: number): ModelTier | null {
  const order: ModelEntry["tier"][] = ["PRO", "MEDIUM", "LIGHT"];
  for (const tier of order) {
    const models = getPackModels("LOCAL", tier);
    if (models.length === 0) continue;
    const requiredRamGB = Math.max(...models.map((m) => m.local?.ramGB ?? Infinity));
    if (requiredRamGB <= systemRamGB) return tier;
  }
  return null;
}

export function defaultModelFor(category: ModelEntry["category"]): ModelEntry {
  // Default to the free Gemini Medium tier where it exists (TEXT, VISION).
  // Otherwise prefer an entry that can actually run (runtime !== "none") —
  // this makes TRANSCRIPTION default to local Whisper Medium rather than the
  // catalog-only Cloud placeholder. Falls back to whatever exists so Settings
  // never crashes on an empty preference.
  const catalog = getModelCatalog().filter((m) => m.category === category);
  const runnable = (m: ModelEntry) => m.runtime !== "none";
  return (
    catalog.find((m) => m.runtime === "gemini" && m.tier === "MEDIUM") ??
    catalog.find((m) => m.mode === "CLOUD" && m.tier === "MEDIUM" && runnable(m)) ??
    catalog.find((m) => m.tier === "MEDIUM" && runnable(m)) ??
    catalog.find((m) => m.mode === "CLOUD" && m.tier === "MEDIUM") ??
    catalog[0]
  );
}
