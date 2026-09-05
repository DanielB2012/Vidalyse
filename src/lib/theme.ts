// Shared light/dark theme helpers. Used by the Apparence section in Settings and
// by the profile menu in the top bar — both must stay in sync, so applyTheme()
// broadcasts a "vidalyse-theme" event the other listener picks up.

export type Theme = "system" | "light" | "dark";

export const THEME_STORAGE_KEY = "vidalyse-theme";
export const THEME_EVENT = "vidalyse-theme";

export function readStoredTheme(): Theme {
  if (typeof window === "undefined") return "system";
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    return saved === "light" || saved === "dark" ? saved : "system";
  } catch {
    return "system";
  }
}

export function applyTheme(theme: Theme): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (theme === "system") {
    delete root.dataset.theme;
    try {
      localStorage.removeItem(THEME_STORAGE_KEY);
    } catch {}
  } else {
    root.dataset.theme = theme;
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {}
  }
  window.dispatchEvent(new CustomEvent<Theme>(THEME_EVENT, { detail: theme }));
}
