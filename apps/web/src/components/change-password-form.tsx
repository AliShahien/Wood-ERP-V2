"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/primitives";
import { useI18n } from "@/components/i18n-provider";
import { api, ApiError } from "@/lib/api-client";

export function ChangePasswordForm({ redirectTo }: { redirectTo?: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const f = new FormData(formEl);
    if (f.get("newPassword") !== f.get("confirmPassword")) return setError(t("auth.passwordsDontMatch"));
    setPending(true);
    setError(null);
    try {
      await api("/auth/change-password", { body: { currentPassword: f.get("currentPassword"), newPassword: f.get("newPassword") } });
      toast.success(t("auth.passwordChanged"));
      formEl.reset();
      if (redirectTo) {
        router.replace(redirectTo);
        router.refresh();
      }
    } catch (err) {
      setError(t(err instanceof ApiError ? err.body.messageKey : "errors.internal"));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <Field label={t("auth.currentPassword")} htmlFor="currentPassword">
        <Input id="currentPassword" name="currentPassword" type="password" autoComplete="current-password" required dir="ltr" />
      </Field>
      <Field label={t("auth.newPassword")} htmlFor="newPassword" hint={t("auth.passwordHint")}>
        <Input id="newPassword" name="newPassword" type="password" autoComplete="new-password" required minLength={8} dir="ltr" />
      </Field>
      <Field label={t("auth.confirmPassword")} htmlFor="confirmPassword">
        <Input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" required dir="ltr" />
      </Field>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <Button type="submit" disabled={pending}>{t("common.save")}</Button>
    </form>
  );
}
