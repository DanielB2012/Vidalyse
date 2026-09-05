"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { useT } from "@/i18n/LanguageProvider";

// Spec §6: the Lyra trigger must use /logo-lyra.png when it exists, never a
// substitute icon. Drop the real asset in /public/logo-lyra.png and this
// component picks it up automatically — until then it falls back honestly to
// a generic icon instead of fabricating a logo.
export function LyraButton({ onClick }: { onClick: () => void }) {
  const { t } = useT();
  const [logoFailed, setLogoFailed] = useState(false);

  return (
    <button
      onClick={onClick}
      aria-label={t("lyra.open")}
      className="flex items-center gap-2 rounded-full border border-border-strong bg-surface-raised px-3.5 py-2 text-sm font-medium text-foreground transition hover:border-accent/60"
    >
      {logoFailed ? (
        <Sparkles size={20} className="text-accent" />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src="/logo-lyra.png"
          alt="Lyra"
          className="h-6 w-6 object-contain"
          onError={() => setLogoFailed(true)}
        />
      )}
      Lyra
    </button>
  );
}
