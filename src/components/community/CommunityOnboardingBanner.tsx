"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Users2, X, ArrowRight } from "lucide-react";
import { useT } from "@/i18n/LanguageProvider";

const DISMISS_KEY = "vidalyse:community-onboarding-dismissed";

// Shown on the dashboard when the user has no community profile yet — the
// "asked on first login" nudge. Dismissing it only hides this banner
// (localStorage, per-device); the ask stays available on /community and in
// Paramètres, so nothing is lost.
export function CommunityOnboardingBanner() {
  const { t } = useT();
  const [state, setState] = useState<"pending" | "show" | "hidden">("pending");

  // One-time read of a per-device "don't nag me" flag after mount (localStorage
  // is client-only; "pending" renders nothing so there's no hydration mismatch).
  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = Boolean(localStorage.getItem(DISMISS_KEY));
    } catch {
      dismissed = false;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState(dismissed ? "hidden" : "show");
  }, []);

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // private mode / storage blocked — just hide for this render
    }
    setState("hidden");
  }

  if (state !== "show") return null;

  return (
    <div className="relative flex flex-col gap-3 rounded-2xl border border-accent/30 bg-accent/5 p-5 sm:flex-row sm:items-center sm:justify-between">
      <button
        onClick={dismiss}
        aria-label={t("community.onboardingLater")}
        className="absolute right-3 top-3 text-muted hover:text-foreground"
      >
        <X size={15} />
      </button>
      <div className="flex items-start gap-3 pr-6">
        <Users2 size={18} className="mt-0.5 shrink-0 text-accent" />
        <div>
          <p className="text-sm font-semibold">{t("community.onboardingTitle")}</p>
          <p className="mt-0.5 text-xs text-muted">{t("community.onboardingBody")}</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <button onClick={dismiss} className="text-xs text-muted hover:text-foreground">
          {t("community.onboardingLater")}
        </button>
        <Link
          href="/community"
          className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white"
        >
          {t("community.onboardingCreate")}
          <ArrowRight size={13} />
        </Link>
      </div>
    </div>
  );
}
