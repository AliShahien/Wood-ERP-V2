import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { createTranslator, DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, type Locale } from "@edge/i18n";
import { getDb } from "@edge/db";
import { getSession } from "./session";

/** Signed-in: the user's stored language. Otherwise: cookie → Accept-Language → Arabic. */
export const getLocale = cache(async (): Promise<Locale> => {
  const session = await getSession();
  if (session) return session.actor.locale;
  const c = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(c)) return c;
  const accept = (await headers()).get("accept-language") ?? "";
  return accept.toLowerCase().startsWith("en") ? "en" : DEFAULT_LOCALE;
});

const getOverrides = cache(async (locale: Locale) => {
  const rows = await getDb().translation.findMany({ where: { locale }, select: { key: true, value: true } });
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
});

export const getT = cache(async () => {
  const locale = await getLocale();
  return { t: createTranslator(locale, await getOverrides(locale)), locale, overrides: await getOverrides(locale) };
});
