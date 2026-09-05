"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { signIn, signOut } from "next-auth/react";
import {
  User,
  Settings,
  LogOut,
  UserRoundPlus,
  Monitor,
  Sun,
  Moon,
  Palette,
  Languages,
  Check,
  ChevronRight,
  ChevronLeft,
} from "lucide-react";
import { applyTheme, readStoredTheme, THEME_EVENT, type Theme } from "@/lib/theme";
import { useT } from "@/i18n/LanguageProvider";
import { LOCALES, LOCALE_LABEL } from "@/i18n/config";

type Panel = "main" | "theme" | "language";

const THEME_CHOICES: { value: Theme; key: string; icon: typeof Monitor }[] = [
  { value: "dark", key: "theme.dark", icon: Moon },
  { value: "system", key: "theme.device", icon: Monitor },
  { value: "light", key: "theme.light", icon: Sun },
];

export function ProfileMenu({
  userName,
  userImage,
  userEmail,
}: {
  userName: string | null;
  userImage: string | null;
  userEmail: string | null;
}) {
  const { t, locale, setLocale } = useT();
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<Panel>("main");
  const [theme, setTheme] = useState<Theme>("system");
  const ref = useRef<HTMLDivElement>(null);

  const close = () => {
    setOpen(false);
    setPanel("main");
  };

  useEffect(() => {
    const id = setTimeout(() => setTheme(readStoredTheme()), 0);
    const onThemeChange = (e: Event) => setTheme((e as CustomEvent<Theme>).detail);
    window.addEventListener(THEME_EVENT, onThemeChange);
    return () => {
      clearTimeout(id);
      window.removeEventListener(THEME_EVENT, onThemeChange);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const themeLabel = (v: Theme) =>
    t(THEME_CHOICES.find((c) => c.value === v)?.key ?? "theme.device");

  const channelName = userName ?? t("menu.myChannel");
  const initial = channelName.trim().charAt(0).toUpperCase();

  const avatar = (size: string) =>
    userImage ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={userImage} alt="" className={`${size} rounded-full`} />
    ) : (
      <span
        className={`${size} flex items-center justify-center rounded-full bg-surface-raised text-xs font-semibold`}
      >
        {initial}
      </span>
    );

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => (open ? close() : setOpen(true))}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("menu.channelMenu")}
        className="flex items-center gap-2 rounded-full border border-border py-1 pl-1 pr-2 transition hover:border-border-strong"
      >
        {avatar("h-7 w-7")}
        <span className="hidden max-w-[10rem] truncate text-sm text-muted sm:block">
          {channelName}
        </span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-72 overflow-hidden rounded-xl border border-border bg-surface shadow-xl"
        >
          {panel === "main" && (
            <>
              <div className="flex items-center gap-3 border-b border-border p-4">
                {avatar("h-10 w-10")}
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{channelName}</p>
                  {userEmail && <p className="truncate text-xs text-muted">{userEmail}</p>}
                </div>
              </div>

              <div className="py-1">
                <MenuLink
                  href="/profile"
                  icon={User}
                  label={t("menu.profile")}
                  onNavigate={close}
                />
                <MenuLink
                  href="/settings"
                  icon={Settings}
                  label={t("menu.settings")}
                  onNavigate={close}
                />
              </div>

              <div className="border-t border-border py-1">
                <SubmenuRow
                  icon={Palette}
                  label={t("menu.theme")}
                  value={themeLabel(theme)}
                  onClick={() => setPanel("theme")}
                />
                <SubmenuRow
                  icon={Languages}
                  label={t("menu.language")}
                  value={LOCALE_LABEL[locale]}
                  onClick={() => setPanel("language")}
                />
              </div>

              <div className="border-t border-border py-1">
                <button
                  role="menuitem"
                  onClick={() =>
                    signIn("google", { redirectTo: "/dashboard" }, { prompt: "select_account" })
                  }
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-muted transition hover:bg-surface-raised hover:text-foreground"
                >
                  <UserRoundPlus size={16} /> {t("menu.switchAccount")}
                </button>
                <button
                  role="menuitem"
                  onClick={() => signOut({ redirectTo: "/login" })}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-muted transition hover:bg-surface-raised hover:text-foreground"
                >
                  <LogOut size={16} /> {t("menu.signOut")}
                </button>
              </div>
            </>
          )}

          {panel === "theme" && (
            <>
              <PanelHeader label={t("menu.theme")} onBack={() => setPanel("main")} />
              <div className="py-1">
                {THEME_CHOICES.map(({ value, key, icon: Icon }) => (
                  <button
                    key={value}
                    role="menuitemradio"
                    aria-checked={theme === value}
                    onClick={() => applyTheme(value)}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-muted transition hover:bg-surface-raised hover:text-foreground"
                  >
                    <Icon size={16} />
                    <span className="flex-1 text-left">{t(key)}</span>
                    {theme === value && <Check size={15} className="text-accent" />}
                  </button>
                ))}
              </div>
            </>
          )}

          {panel === "language" && (
            <>
              <PanelHeader label={t("menu.language")} onBack={() => setPanel("main")} />
              <div className="py-1">
                {LOCALES.map((code) => (
                  <button
                    key={code}
                    role="menuitemradio"
                    aria-checked={locale === code}
                    onClick={() => setLocale(code)}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-muted transition hover:bg-surface-raised hover:text-foreground"
                  >
                    <span className="flex-1 text-left">{LOCALE_LABEL[code]}</span>
                    {locale === code && <Check size={15} className="text-accent" />}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function MenuLink({
  href,
  icon: Icon,
  label,
  onNavigate,
}: {
  href: string;
  icon: typeof User;
  label: string;
  onNavigate: () => void;
}) {
  return (
    <Link
      href={href}
      role="menuitem"
      onClick={onNavigate}
      className="flex items-center gap-3 px-4 py-2.5 text-sm text-muted transition hover:bg-surface-raised hover:text-foreground"
    >
      <Icon size={16} /> {label}
    </Link>
  );
}

function SubmenuRow({
  icon: Icon,
  label,
  value,
  onClick,
}: {
  icon: typeof User;
  label: string;
  value: string;
  onClick: () => void;
}) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-muted transition hover:bg-surface-raised hover:text-foreground"
    >
      <Icon size={16} />
      <span className="flex-1 text-left">{label}</span>
      <span className="text-xs text-muted">{value}</span>
      <ChevronRight size={15} className="shrink-0" />
    </button>
  );
}

function PanelHeader({ label, onBack }: { label: string; onBack: () => void }) {
  return (
    <button
      onClick={onBack}
      className="flex w-full items-center gap-2 border-b border-border px-3 py-3 text-sm font-medium transition hover:bg-surface-raised"
    >
      <ChevronLeft size={16} className="text-muted" />
      {label}
    </button>
  );
}
