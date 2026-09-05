"use client";

import { createContext, useContext } from "react";

// Lets any panel deep in the analysis workspace move the shared <video> player
// to a real timestamp. `null` seek = no player available (result viewed with
// no local file); consumers should hide their "aller à ce moment" affordances.
export interface SeekApi {
  seekTo: ((ms: number) => void) | null;
}

const SeekContext = createContext<SeekApi>({ seekTo: null });

export const SeekProvider = SeekContext.Provider;

export function useSeek(): SeekApi {
  return useContext(SeekContext);
}
