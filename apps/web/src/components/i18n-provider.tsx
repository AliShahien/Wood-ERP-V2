"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { createTranslator, type Locale, type Translator } from "@edge/i18n";

const I18nContext = createContext<{ t: Translator; locale: Locale } | null>(null);

export function I18nProvider({ locale, overrides, children }: { locale: Locale; overrides: Record<string, string>; children: ReactNode }) {
  const value = useMemo(() => ({ t: createTranslator(locale, overrides), locale }), [locale, overrides]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside I18nProvider");
  return ctx;
}
