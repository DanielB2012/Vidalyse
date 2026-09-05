"use client";

import { useEffect, useState } from "react";
import { Monitor, Sun, Moon, Check } from "lucide-react";
import { applyTheme, readStoredTheme, THEME_EVENT, type Theme } from "@/lib/theme";
import { useT } from "@/i18n/LanguageProvider";

const OPTIONS: {
  value: Theme;
  labelKey: string;
  hintKey: string;
  icon: typeof Monitor;
}[] = [
  { value: "system", labelKey: "appearance.systemLabel", hintKey: "appearance.systemHint", icon: Monitor },
  { value: "light", labelKey: "appearance.lightLabel", hintKey: "appearance.lightHint", icon: Sun },
  { value: "dark", labelKey: "appearance.darkLabel", hintKey: "appearance.darkHint", icon: Moon },
];

export function AppearanceSection() {
  const { t } = useT();
  // SSR can't read localStorage; sync on mount. The anti-FOUC script in the root
  // layout has already applied the right theme visually by then.
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    const id = setTimeout(() => setTheme(readStoredTheme()), 0);
    const onChange = (e: Event) => setTheme((e as CustomEvent<Theme>).detail);
    window.addEventListener(THEME_EVENT, onChange);
    return () => {
      clearTimeout(id);
      window.removeEventListener(THEME_EVENT, onChange);
    };
  }, []);

  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold text-muted">{t("appearance.heading")}</h2>
      <div className="rounded-2xl border border-border bg-surface p-5">
        <p className="text-sm font-medium">{t("appearance.themeTitle")}</p>
        <p className="mt-1 text-xs text-muted">{t("appearance.themeDescription")}</p>

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {OPTIONS.map(({ value, labelKey, hintKey, icon: Icon }) => {
            const active = theme === value;
            return (
              <button
                key={value}
                onClick={() => applyTheme(value)}
                aria-pressed={active}
                className={`flex flex-col rounded-xl border p-4 text-left transition ${
                  active
                    ? "border-accent bg-accent/10"
                    : "border-border bg-surface hover:border-accent/50"
                }`}
              >
                <div className="flex items-center justify-between">
                  <Icon size={16} className={active ? "text-accent" : "text-muted"} />
                  {active && <Check size={14} className="text-accent" />}
                </div>
                <span className="mt-2 text-sm font-medium">{t(labelKey)}</span>
                <span className="mt-0.5 text-xs text-muted">{t(hintKey)}</span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
