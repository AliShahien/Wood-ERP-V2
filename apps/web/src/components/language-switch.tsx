"use client";

import { useRouter } from "next/navigation";
import { Languages } from "@/components/ui/material-icons";
import { LOCALE_COOKIE, type Locale } from "@edge/i18n";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/i18n-provider";
import { api } from "@/lib/api-client";

/** Signed in: persists the choice on the user's profile. Signed out: cookie only. */
export function LanguageSwitch({ signedIn = false }: { signedIn?: boolean }) {
  const { locale, t } = useI18n();
  const router = useRouter();
  const next: Locale = locale === "ar" ? "en" : "ar";

  async function toggle() {
    if (signedIn) await api("/profile", { method: "PATCH", body: { locale: next } });
    else document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  }

  return (
    <Button type="button" variant="ghost" size="sm" onClick={toggle} lang={next}>
      <Languages />
      {next === "ar" ? t("common.arabic") : t("common.english")}
    </Button>
  );
}
