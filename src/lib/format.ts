import type { Locale } from "@/i18n/config";

const NA: Record<Locale, string> = { fr: "Donnée indisponible", en: "Data unavailable" };
const bcp47 = (locale: Locale) => (locale === "en" ? "en-US" : "fr-FR");

export function formatDuration(sec: number | null, locale: Locale = "fr"): string {
  if (sec === null) return NA[locale];
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function formatCount(n: number | null, locale: Locale = "fr"): string {
  return n === null ? NA[locale] : new Intl.NumberFormat(bcp47(locale)).format(n);
}

export function formatDate(iso: string | null, locale: Locale = "fr"): string {
  if (!iso) return NA[locale];
  return new Intl.DateTimeFormat(bcp47(locale), {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}

// Short timestamp for chat/message UIs: "14:32" if today, else "5 mars".
export function formatMessageTime(iso: string, locale: Locale = "fr"): string {
  const date = new Date(iso);
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  return new Intl.DateTimeFormat(bcp47(locale), sameDay ? { hour: "2-digit", minute: "2-digit" } : { day: "numeric", month: "short" }).format(date);
}
