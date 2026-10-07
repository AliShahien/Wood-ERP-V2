"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { KeyRound, Power } from "@/components/ui/material-icons";
import { Dialog } from "radix-ui";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/primitives";
import { useI18n } from "@/components/i18n-provider";
import { api, ApiError } from "@/lib/api-client";

export function UserActions({ userId, status, canDeactivate, canReset }: { userId: string; status: string; canDeactivate: boolean; canReset: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const fail = (err: unknown) => toast.error(t(err instanceof ApiError ? err.body.messageKey : "errors.internal"));

  async function toggleStatus() {
    if (!confirm(t("common.areYouSure"))) return;
    try {
      await api(`/users/${userId}`, { method: "PATCH", body: { status: status === "ACTIVE" ? "INACTIVE" : "ACTIVE" } });
      toast.success(t("common.saved"));
      router.refresh();
    } catch (err) {
      fail(err);
    }
  }

  async function reset() {
    setError(null);
    try {
      await api(`/users/${userId}/reset-password`, { body: { newPassword: password } });
      toast.success(t("users.resetDone"));
      setOpen(false);
      setPassword("");
    } catch (err) {
      setError(t(err instanceof ApiError ? err.body.messageKey : "errors.internal"));
    }
  }

  return (
    <>
      {canReset ? (
        <Dialog.Root open={open} onOpenChange={setOpen}>
          <Dialog.Trigger asChild>
            <Button variant="outline"><KeyRound />{t("users.resetPassword")}</Button>
          </Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
            <Dialog.Content className="fixed start-1/2 top-1/2 z-50 grid w-[min(92vw,420px)] -translate-y-1/2 gap-4 rounded-lg border bg-card p-6 shadow-lg ltr:-translate-x-1/2 rtl:translate-x-1/2">
              <Dialog.Title className="text-base font-semibold">{t("users.resetPassword")}</Dialog.Title>
              <Dialog.Description className="text-sm text-muted-foreground">{t("auth.passwordHint")}</Dialog.Description>
              <Field label={t("auth.newPassword")} htmlFor="reset-pw" error={error}>
                <Input id="reset-pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" dir="ltr" />
              </Field>
              <div className="flex justify-end gap-2">
                <Dialog.Close asChild><Button variant="outline">{t("common.cancel")}</Button></Dialog.Close>
                <Button onClick={reset} disabled={password.length < 8}>{t("common.confirm")}</Button>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      ) : null}
      {canDeactivate ? (
        <Button variant={status === "ACTIVE" ? "destructive" : "secondary"} onClick={toggleStatus}>
          <Power />
          {status === "ACTIVE" ? t("users.deactivate") : t("users.activate")}
        </Button>
      ) : null}
    </>
  );
}
