"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  BarChart3,
  Clapperboard,
  Sparkles,
  Rocket,
  User,
  FolderKanban,
  Users,
  MessageCircle,
  Settings,
  X,
} from "lucide-react";
import clsx from "clsx";
import { useT } from "@/i18n/LanguageProvider";
import { SOCIAL_ENABLED } from "@/lib/features";

const NAV_ITEMS = [
  { href: "/dashboard", key: "nav.dashboard", icon: LayoutDashboard },
  { href: "/analytics", key: "nav.analytics", icon: BarChart3 },
  { href: "/content", key: "nav.content", icon: Clapperboard },
  { href: "/content/analyzed", key: "nav.analyzeContent", icon: Sparkles },
  { href: "/content/pre-publish", key: "nav.prePublish", icon: Rocket },
  { href: "/projects", key: "nav.projects", icon: FolderKanban },
  // Communauté + Messagerie only appear when the social layer is enabled
  // (needs a central server — see src/lib/features.ts).
  ...(SOCIAL_ENABLED
    ? [
        { href: "/community", key: "nav.community", icon: Users },
        { href: "/messages", key: "nav.messages", icon: MessageCircle },
      ]
    : []),
  { href: "/profile", key: "nav.profile", icon: User },
];

// "/content" nests several views — each gets its own nav item, so the generic
// startsWith check would light up more than one at once. Route each /content/*
// segment to exactly one.
function isNavActive(href: string, pathname: string): boolean {
  if (href === "/content") {
    return pathname === "/content" || pathname.startsWith("/content/published");
  }
  if (href === "/content/pre-publish") {
    return pathname.startsWith("/content/pre-publish");
  }
  if (href === "/content/analyzed") {
    return (
      pathname.startsWith("/content/analyzed") ||
      (/^\/content\/[^/]+$/.test(pathname) && pathname !== "/content/pre-publish")
    );
  }
  return pathname === href || pathname.startsWith(href + "/");
}

export function Sidebar({
  open = false,
  onClose,
  unreadMessages = 0,
}: { open?: boolean; onClose?: () => void; unreadMessages?: number } = {}) {
  const pathname = usePathname();
  const { t } = useT();
  const [logoFailed, setLogoFailed] = useState(false);

  return (
    <>
      {/* mobile backdrop */}
      {open && (
        <button
          aria-label={t("nav.closeMenu")}
          onClick={onClose}
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
        />
      )}
      <aside
        className={clsx(
          "flex h-screen w-60 shrink-0 flex-col border-r border-border bg-surface",
          "fixed inset-y-0 left-0 z-40 transition-transform lg:static lg:z-auto lg:translate-x-0 lg:bg-surface/60",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
      <div className="flex items-center gap-2 px-5 pt-2.5">
        {onClose && (
          <button
            onClick={onClose}
            aria-label={t("nav.closeMenu")}
            className="absolute right-3 top-3 text-muted hover:text-foreground lg:hidden"
          >
            <X size={18} />
          </button>
        )}
        {logoFailed ? (
          <div className="flex items-center gap-2 py-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg gradient-ring text-sm font-bold text-white">
              V
            </div>
            <span className="text-lg font-semibold tracking-tight gradient-text">Vidalyse</span>
          </div>
        ) : (
          // The wordmark PNG is white on a transparent bg — fine on the dark
          // theme, invisible on the light one. `.brand-logo` turns it into a
          // solid black silhouette in light mode (see globals.css); no-op on dark.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src="/logo-vidalyse-complet.png"
            alt="Vidalyse"
            className="brand-logo -my-4 h-24 w-auto max-w-full object-contain"
            onError={() => setLogoFailed(true)}
          />
        )}
      </div>

      <nav className="flex-1 space-y-1 px-3 pt-2">
        {NAV_ITEMS.map(({ href, key, icon: Icon }) => {
          const active = isNavActive(href, pathname);
          return (
            <Link
              key={href}
              href={href}
              onClick={onClose}
              className={clsx(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition",
                active
                  ? "bg-surface-raised text-foreground border border-border-strong"
                  : "text-muted hover:bg-surface-raised/60 hover:text-foreground border border-transparent"
              )}
            >
              <Icon size={17} strokeWidth={2} />
              <span className="flex-1">{t(key)}</span>
              {href === "/messages" && unreadMessages > 0 && (
                <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-accent px-1.5 text-[11px] font-semibold text-white">
                  {unreadMessages}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-border px-3 py-3">
        <Link
          href="/settings"
          onClick={onClose}
          className={clsx(
            "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition",
            pathname.startsWith("/settings")
              ? "bg-surface-raised text-foreground border border-border-strong"
              : "text-muted hover:bg-surface-raised/60 hover:text-foreground border border-transparent"
          )}
        >
          <Settings size={17} strokeWidth={2} />
          {t("nav.settings")}
        </Link>
      </div>
      </aside>
    </>
  );
}
