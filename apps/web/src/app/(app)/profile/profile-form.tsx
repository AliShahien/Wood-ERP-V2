"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input, NativeSelect } from "@/components/ui/primitives";
import { useI18n } from "@/components/i18n-provider";
import { api, ApiError } from "@/lib/api-client";

export function ProfileForm({ initial }: { initial: { fullName: string; phone: string | null; locale: "ar" | "en"; username: string; email: string | null } }) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setPending(true);
    try {
      await api("/profile", { method: "PATCH", body: { fullName: f.get("fullName"), phone: f.get("phone") || null, locale: f.get("locale") } });
      toast.success(t("profile.saved"));
      router.refresh();
    } catch (err) {
      toast.error(t(err instanceof ApiError ? err.body.messageKey : "errors.internal"));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <Field label={t("users.username")} htmlFor="u"><Input id="u" value={initial.username} disabled dir="ltr" /></Field>
      <Field label={t("users.email")} htmlFor="e"><Input id="e" value={initial.email ?? ""} disabled dir="ltr" /></Field>
      <Field label={t("users.fullName")} htmlFor="fullName"><Input id="fullName" name="fullName" defaultValue={initial.fullName} required /></Field>
      <Field label={t("users.phone")} htmlFor="phone"><Input id="phone" name="phone" defaultValue={initial.phone ?? ""} dir="ltr" /></Field>
      <Field label={t("common.language")} htmlFor="locale">
        <NativeSelect id="locale" name="locale" defaultValue={initial.locale}>
          <option value="ar">{t("common.arabic")}</option>
          <option value="en">{t("common.english")}</option>
        </NativeSelect>
      </Field>
      <div><Button type="submit" disabled={pending}>{t("common.save")}</Button></div>
    </form>
  );
}
