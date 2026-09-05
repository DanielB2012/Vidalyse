"use client";

import { usePageContextForLyra } from "./LyraContext";

// Drop this in any server-component page to tell Lyra what's on screen
// (spec §6) without converting the whole page to a client component.
export function LyraPageContext({ description }: { description: string }) {
  usePageContextForLyra(description);
  return null;
}
