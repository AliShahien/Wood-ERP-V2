"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, Field, Input } from "@/components/ui/primitives";
import { useI18n } from "@/components/i18n-provider";
import { MaterialLines, newLine, type MaterialLine } from "@/components/material-lines";
import { api, ApiError } from "@/lib/api-client";

export function PurchaseRequestForm() {
  const { t } = useI18n();
  const router = useRouter();
  const [lines, setLines] = useState<MaterialLine[]>([newLine()]);
  const [pending, setPending] = useState(false);
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    setPending(true);
    try {
      const res = await api<{ id: string }>("/purchase-requests", {
        body: { requiredDate: f.requiredDate || null, reason: f.reason || null, items: lines.filter((l) => l.material && l.quantity).map((l) => ({ materialId: l.material!.id, quantity: Number(l.quantity) })) },
      });
      router.push(`/purchase-requests/${res.id}`);
    } catch (err) {
      toast.error(t(err instanceof ApiError ? err.body.messageKey : "errors.internal"));
    } finally {
      setPending(false);
    }
  }
  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <Card>
        <CardContent className="grid gap-4 pt-5 sm:grid-cols-2">
          <Field label={t("purchasing.requiredDate")}><Input name="requiredDate" type="date" dir="ltr" /></Field>
          <Field label={t("purchasing.reason")}><Input name="reason" /></Field>
          <div className="sm:col-span-2"><MaterialLines lines={lines} onChange={setLines} /></div>
        </CardContent>
      </Card>
      <div><Button type="submit" disabled={pending}>{t("common.save")}</Button></div>
    </form>
  );
}
