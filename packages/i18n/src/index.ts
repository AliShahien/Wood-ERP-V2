import ar from "../messages/ar.json";
import en from "../messages/en.json";

export const LOCALES = ["ar", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "ar";
export const LOCALE_COOKIE = "edge_locale";

export type Messages = typeof en;
const catalogs: Record<Locale, Messages> = { ar: ar as Messages, en };

export function isLocale(v: unknown): v is Locale {
  return v === "ar" || v === "en";
}

export function dirOf(locale: Locale): "rtl" | "ltr" {
  return locale === "ar" ? "rtl" : "ltr";
}

export function getMessages(locale: Locale): Messages {
  return catalogs[locale];
}

type Params = Record<string, string | number>;
export type Translator = (key: string, params?: Params) => string;

function lookup(messages: unknown, key: string): string | undefined {
  let node: unknown = messages;
  for (const part of key.split(".")) {
    if (node && typeof node === "object" && part in node) node = (node as Record<string, unknown>)[part];
    else return undefined;
  }
  return typeof node === "string" ? node : undefined;
}

/**
 * Creates `t(key, params)`. Missing keys fall back to English, then to the key itself
 * (visible in the UI so missing translations are noticed, never silently blank).
 * `overrides` = rows from the `translations` table.
 */
export function createTranslator(locale: Locale, overrides?: Record<string, string>): Translator {
  const messages = catalogs[locale];
  return (key, params) => {
    let text = overrides?.[key] ?? lookup(messages, key) ?? lookup(catalogs.en, key) ?? key;
    if (params) for (const [k, v] of Object.entries(params)) text = text.replaceAll(`{${k}}`, String(v));
    return text;
  };
}

/** Flattened key list — used by the key-parity test. */
export function flattenKeys(obj: unknown, prefix = ""): string[] {
  if (!obj || typeof obj !== "object") return [prefix];
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) => flattenKeys(v, prefix ? `${prefix}.${k}` : k));
}

// Intl inserts bidi control marks (RLM/LRM/ALM) in Arabic output; they reorder digits when the
// value is displayed inside an LTR-isolated span, so they are stripped.
const BIDI_MARKS = /[‎‏؜]/g;

export function formatNumber(locale: Locale, value: number | string, fractionDigits = 2): string {
  return new Intl.NumberFormat(locale === "ar" ? "ar-EG-u-nu-latn" : "en-US", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })
    .format(Number(value))
    .replace(BIDI_MARKS, "");
}

/** dd/mm/yyyy (+ HH:mm) in both languages — codes, numbers and dates are always shown LTR. */
export function formatDate(_locale: Locale, value: Date | string, withTime = false): string {
  const d = new Date(value);
  const p = (n: number) => String(n).padStart(2, "0");
  const date = `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
  return withTime ? `${date} ${p(d.getHours())}:${p(d.getMinutes())}` : date;
}
