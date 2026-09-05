"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { UserRoundPlus, CheckCircle2, Loader2, X, AlertTriangle } from "lucide-react";
import { useT } from "@/i18n/LanguageProvider";

export interface ConnectedGoogleAccount {
  id: string;
  active: boolean;
  scope: string | null;
  name: string;
  email: string | null;
  image: string | null;
}

export function ConnectedAccountsSection({ accounts }: { accounts: ConnectedGoogleAccount[] }) {
  const router = useRouter();
  const { t } = useT();
  const [adding, setAdding] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function addAccount() {
    setError(null);
    setAdding(true);
    try {
      const res = await fetch("/api/accounts/google/link-intent", { method: "POST" });
      if (!res.ok) {
        setError(t("connectedAccounts.addFailed"));
        setAdding(false);
        return;
      }
      await signIn("google", { callbackUrl: "/settings?accountAdded=1" }, { prompt: "select_account consent" });
    } catch {
      setError(t("connectedAccounts.addFailed"));
      setAdding(false);
    }
  }

  async function activate(id: string) {
    setError(null);
    setPendingId(id);
    try {
      const res = await fetch(`/api/accounts/google/${id}/activate`, { method: "POST" });
      if (!res.ok) {
        setError(t("connectedAccounts.activateFailed"));
        return;
      }
      startTransition(() => router.refresh());
    } catch {
      setError(t("connectedAccounts.activateFailed"));
    } finally {
      setPendingId(null);
    }
  }

  async function remove(id: string) {
    setError(null);
    setPendingId(id);
    try {
      const res = await fetch(`/api/accounts/google/${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error === "last_account" ? t("connectedAccounts.lastAccount") : t("connectedAccounts.removeFailed"));
        return;
      }
      startTransition(() => router.refresh());
    } catch {
      setError(t("connectedAccounts.removeFailed"));
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {accounts.map((acc) => (
          <div
            key={acc.id}
            className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-4"
          >
            <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-surface-raised">
              {acc.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={acc.image} alt="" className="h-full w-full object-cover" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{acc.name}</p>
              {acc.email && <p className="truncate text-xs text-muted">{acc.email}</p>}
            </div>
            {acc.active ? (
              <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-success/40 bg-success/10 px-2.5 py-1 text-xs font-medium text-success">
                <CheckCircle2 size={13} /> {t("connectedAccounts.active")}
              </span>
            ) : (
              <button
                onClick={() => activate(acc.id)}
                disabled={pendingId === acc.id}
                className="shrink-0 rounded-lg border border-accent/60 bg-accent/10 px-3 py-1.5 text-xs font-semibold text-accent hover:bg-accent/20 disabled:opacity-50"
              >
                {pendingId === acc.id ? <Loader2 size={13} className="animate-spin" /> : t("connectedAccounts.activate")}
              </button>
            )}
            <button
              onClick={() => remove(acc.id)}
              disabled={pendingId === acc.id}
              aria-label={t("connectedAccounts.remove")}
              className="shrink-0 rounded-lg border border-border-strong p-1.5 text-muted hover:border-danger/60 hover:text-danger disabled:opacity-50"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>

      {error && (
        <p className="flex items-center gap-1.5 text-xs text-danger">
          <AlertTriangle size={12} className="shrink-0" /> {error}
        </p>
      )}

      <button
        onClick={addAccount}
        disabled={adding}
        className="flex items-center gap-2 rounded-lg border border-dashed border-border-strong px-3.5 py-2 text-xs font-medium text-muted transition hover:border-accent/60 hover:text-foreground disabled:opacity-50"
      >
        {adding ? <Loader2 size={14} className="animate-spin" /> : <UserRoundPlus size={14} />}
        {adding ? t("connectedAccounts.redirecting") : t("connectedAccounts.add")}
      </button>
      <p className="text-[11px] text-muted">{t("connectedAccounts.addHint")}</p>
    </div>
  );
}
