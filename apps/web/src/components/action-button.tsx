"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/i18n-provider";
import { api, ApiError } from "@/lib/api-client";

/**
 * Calls an API action (delete, approve, post, cancel ...) after optional confirmation.
 * `prompt` asks for a reason/notes, sent as `{ [promptField]: value }`.
 */
export function ActionButton({ endpoint, method = "POST", body, confirmKey = "common.areYouSure", label, variant = "outline", redirectTo, prompt, promptField = "reason", icon, successKey = "common.saved", size }: {
  endpoint: string;
  method?: "POST" | "DELETE" | "PATCH" | "PUT";
  body?: Record<string, unknown>;
  confirmKey?: string | null;
  label: string;
  variant?: "default" | "outline" | "destructive" | "secondary" | "ghost";
  redirectTo?: string;
  prompt?: string;
  promptField?: string;
  icon?: ReactNode;
  successKey?: string;
  size?: "sm" | "default";
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function run() {
    let payload = body;
    if (prompt) {
      const v = window.prompt(t(prompt));
      if (v === null) return;
      payload = { ...(body ?? {}), [promptField]: v };
    } else if (confirmKey && !window.confirm(t(confirmKey))) return;
    setPending(true);
    try {
      const res = await api<{ id?: string }>(endpoint, { method, body: payload ?? (method === "DELETE" ? undefined : {}) });
      toast.success(t(successKey));
      if (redirectTo) router.push(redirectTo.replace(":id", res?.id ?? ""));
      router.refresh();
    } catch (err) {
      toast.error(t(err instanceof ApiError ? err.body.messageKey : "errors.internal", (err instanceof ApiError ? (err.body.details as Record<string, string>) : undefined) ?? undefined));
    } finally {
      setPending(false);
    }
  }

  return (
    <Button type="button" variant={variant} onClick={run} disabled={pending} size={size}>
      {icon}
      {t(label)}
    </Button>
  );
}
