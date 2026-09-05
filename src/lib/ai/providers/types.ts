// Provider abstraction (spec §87): every AI category is swappable between
// Cloud and Local implementations without touching call sites. A ModelEntry
// describes ONE real, verifiable option. Never add an entry for a model/API
// that hasn't actually been confirmed to exist and be reachable.

export type AICategory = "VISION" | "AUDIO" | "TRANSCRIPTION" | "VIDEO" | "TEXT";
export type ProviderMode = "CLOUD" | "LOCAL";
export type ModelTier = "LIGHT" | "MEDIUM" | "PRO";

export type Availability =
  | { status: "available" } // wired up and callable today
  | { status: "requires_setup"; reason: string } // real model, needs a key/install/download
  | { status: "not_integrated"; reason: string }; // no verified path yet — never fake it

// Which real implementation actually handles a call for this entry. "none"
// means the entry is catalog-only (not_integrated) — dispatch must refuse
// to call it rather than silently falling through to another vendor.
export type ProviderRuntime =
  | "anthropic"
  | "gemini"
  | "openai-whisper"
  | "whisper-local"
  | "ollama-text"
  | "ollama-vision"
  | "none";

export interface ModelEntry {
  id: string; // stable id, e.g. "cloud-text-pro"
  category: AICategory;
  mode: ProviderMode;
  tier: ModelTier;
  label: string;
  description: string;
  availability: Availability;
  runtime: ProviderRuntime;
  // Real model id to pass to that runtime's API (e.g. "gemini-2.5-flash",
  // "llama3.2:3b"). Absent when runtime is "none".
  runtimeModelId?: string;
  // Local-only sizing info shown before install (§18).
  local?: {
    diskGB: number;
    ramGB: number;
    vramGB: number;
    engine: "ollama" | "whisper.cpp" | "transformers.js";
  };
}

export interface StructuredEvent {
  timestampMs: number;
  type: string;
  description: string;
  confidence?: number; // omit entirely if the underlying model doesn't emit one — never invent it
}

export interface TextSynthesisInput {
  transcript?: { timestampMs: number; text: string }[];
  visionEvents?: StructuredEvent[];
  audioEvents?: StructuredEvent[];
  youtubeStats?: Record<string, number | string | null>;
  question: string;
}
