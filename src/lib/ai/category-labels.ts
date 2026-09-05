import type { AICategory } from "./providers/types";

export const CATEGORY_LABEL: Record<AICategory, string> = {
  VISION: "Vision (images / frames)",
  AUDIO: "Audio",
  TRANSCRIPTION: "Transcription (parole → texte)",
  VIDEO: "Vidéo (natif)",
  TEXT: "Texte (Lyra, synthèse, YouTube)",
};
