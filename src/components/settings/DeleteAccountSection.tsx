"use client";

import { useState, useTransition } from "react";
import { signOut } from "next-auth/react";
import { Loader2, TriangleAlert } from "lucide-react";
import { deleteAccountAction } from "@/app/(app)/settings/actions";
import { useT } from "@/i18n/LanguageProvider";

export function DeleteAccountSection() {
  const { t } = useT();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onClick() {
    if (!window.confirm(t("settings.dangerZone.confirm"))) return;
    setError(null);
    startTransition(async () => {
      try {
        await deleteAccountAction();
        await signOut({ redirectTo: "/login" });
      } catch {
        setError(t("settings.dangerZone.error"));
      }
    });
  }

  return (
    <section>
      <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-danger">
        <TriangleAlert size={14} />
        {t("settings.dangerZone.title")}
      </h2>
      <div className="flex items-center justify-between gap-4 rounded-2xl border border-danger/40 bg-danger/5 p-5">
        <div>
          <p className="text-sm font-medium">{t("settings.dangerZone.deleteAccount")}</p>
          <p className="mt-1 text-xs text-muted">{t("settings.dangerZone.deleteAccountHint")}</p>
        </div>
        <button
          onClick={onClick}
          disabled={pending}
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-danger/60 bg-danger/10 px-3.5 py-2 text-xs font-semibold text-danger transition hover:bg-danger/20 disabled:opacity-60"
        >
          {pending && <Loader2 size={13} className="animate-spin" />}
          {t("settings.dangerZone.deleteAccount")}
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
    </section>
  );
}
