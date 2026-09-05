import { cookies } from "next/headers";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, type Locale } from "./config";
import { getDictionary } from "./dictionaries";
import { translate } from "./translate";

export async function getLocale(): Promise<Locale> {
  const value = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

// For server components / route handlers: `const { t } = await getT()`.
export async function getT() {
  const locale = await getLocale();
  const dict = getDictionary(locale);
  return {
    locale,
    t: (key: string, vars?: Record<string, string | number>) => translate(dict, key, vars),
  };
}
