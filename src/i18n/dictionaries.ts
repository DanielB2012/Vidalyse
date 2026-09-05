import type { Locale } from "./config";
import { fr, type Messages } from "./messages/fr";
import { en } from "./messages/en";

const DICTIONARIES: Record<Locale, Messages> = { fr, en };

export function getDictionary(locale: Locale): Messages {
  return DICTIONARIES[locale] ?? fr;
}

export type { Messages };
