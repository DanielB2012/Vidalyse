"use client";

import { createContext, useContext, useEffect, useState } from "react";

// Spec §6: Lyra must "know the current context" (a video being analyzed, the
// analytics page, a project being prepared). Pages call usePageContextForLyra
// with a short description; the panel reads whatever was set last.
interface LyraContextValue {
  description: string | null;
  setDescription: (d: string | null) => void;
}

const LyraCtx = createContext<LyraContextValue | null>(null);

export function LyraContextProvider({ children }: { children: React.ReactNode }) {
  const [description, setDescription] = useState<string | null>(null);
  return (
    <LyraCtx.Provider value={{ description, setDescription }}>{children}</LyraCtx.Provider>
  );
}

export function useLyraContext() {
  const ctx = useContext(LyraCtx);
  if (!ctx) throw new Error("useLyraContext must be used within LyraContextProvider");
  return ctx;
}

// Call from any page: usePageContextForLyra("L'utilisateur consulte le Dashboard.")
export function usePageContextForLyra(description: string) {
  const { setDescription } = useLyraContext();
  useEffect(() => {
    setDescription(description);
    return () => setDescription(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [description]);
}

export function useLyraDescription() {
  return useLyraContext().description;
}
