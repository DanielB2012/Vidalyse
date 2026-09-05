"use client";

import Link from "next/link";
import { useT } from "@/i18n/LanguageProvider";

// Link labels go through i18n (site chrome); the legal pages themselves stay
// French-only by design — see the comment in
// src/app/legal/mentions-legales/page.tsx.
export function LegalFooter({ className }: { className?: string }) {
  const { t } = useT();
  return (
    <nav className={className ?? "flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted"}>
      <Link href="/legal/mentions-legales" className="hover:text-foreground hover:underline">
        {t("legal.mentions")}
      </Link>
      <span aria-hidden>·</span>
      <Link href="/legal/confidentialite" className="hover:text-foreground hover:underline">
        {t("legal.privacy")}
      </Link>
      <span aria-hidden>·</span>
      <Link href="/legal/cgu" className="hover:text-foreground hover:underline">
        {t("legal.terms")}
      </Link>
    </nav>
  );
}
