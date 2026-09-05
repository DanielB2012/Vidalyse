// Lightweight i18n, cookie-based (no URL /locale segment, so middleware and the
// (app) route group stay untouched). The locale cookie is read on the server via
// src/i18n/server.ts and mirrored to a client context by LanguageProvider.

export const LOCALES = ["fr", "en"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "fr";
export const LOCALE_COOKIE = "vidalyse-lang";

export function isLocale(value: unknown): value is Locale {
  return value === "fr" || value === "en";
}

export const LOCALE_LABEL: Record<Locale, string> = {
  fr: "Français",
  en: "English",
};
