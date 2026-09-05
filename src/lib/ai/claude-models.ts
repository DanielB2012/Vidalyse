import type { ModelTier } from "./providers/types";

// Shared tier → real Claude model id mapping, used by both the Text (Lyra)
// and Vision providers since they're the same underlying models.
export const TIER_TO_CLAUDE_MODEL: Record<ModelTier, string> = {
  LIGHT: "claude-haiku-4-5",
  MEDIUM: "claude-sonnet-5",
  PRO: "claude-opus-5",
};
