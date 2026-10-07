"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/primitives";
import { useI18n } from "@/components/i18n-provider";
import { LanguageSwitch } from "@/components/language-switch";
import { api, ApiError } from "@/lib/api-client";

export function LoginForm() {
  const { t } = useI18n();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setPending(true);
    setError(null);
    try {
      const res = await api<{ mustChangePassword: boolean }>("/auth/login", {
        body: { username: form.get("username"), password: form.get("password") },
      });
      router.replace(res.mustChangePassword ? "/change-password" : "/");
      router.refresh();
    } catch (err) {
      setError(t(err instanceof ApiError ? err.body.messageKey : "errors.internal"));
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      <Field label={t("auth.username")} htmlFor="username">
        <Input id="username" name="username" autoComplete="username" required dir="ltr" className="text-start" autoFocus />
      </Field>
      <Field label={t("auth.password")} htmlFor="password">
        <Input id="password" name="password" type="password" autoComplete="current-password" required dir="ltr" className="text-start" />
      </Field>
      {error ? (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? t("auth.signingIn") : t("auth.signIn")}
      </Button>
      <div className="flex justify-center pt-2">
        <LanguageSwitch />
      </div>
    </form>
  );
}
