"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Checkbox, Field, Input, Textarea } from "@/components/ui/primitives";
import { useI18n } from "@/components/i18n-provider";
import { api, ApiError } from "@/lib/api-client";

type Values = Record<string, unknown>;

export function SettingsForm({ values, readOnly }: { values: Values; readOnly: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const str = (k: string) => String(values[k] ?? "");

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const body = {
      "company.name": f.get("company.name"),
      "company.address": f.get("company.address"),
      "company.phone": f.get("company.phone"),
      "company.email": f.get("company.email"),
      "company.taxNumber": f.get("company.taxNumber"),
      "finance.currency": f.get("finance.currency"),
      "finance.taxEnabledByDefault": f.get("finance.taxEnabledByDefault") === "on",
      "finance.defaultTaxRate": Number(f.get("finance.defaultTaxRate")),
      "sales.quotationValidityDays": Number(f.get("sales.quotationValidityDays")),
      "sales.defaultDepositPercent": Number(f.get("sales.defaultDepositPercent")),
      "production.defaultOverheadPercent": Number(f.get("production.defaultOverheadPercent")),
      "production.qcChecklist": String(f.get("production.qcChecklist") ?? "").split("\n").map((s) => s.trim()).filter(Boolean),
    };
    setPending(true);
    try {
      await api("/settings", { method: "PATCH", body });
      toast.success(t("common.saved"));
      router.refresh();
    } catch (err) {
      toast.error(t(err instanceof ApiError ? err.body.messageKey : "errors.internal"));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4 lg:grid-cols-2">
      <fieldset disabled={readOnly} className="contents">
        <Card>
          <CardHeader><CardTitle>{t("settings.company")}</CardTitle></CardHeader>
          <CardContent className="grid gap-4">
            <Field label={t("settings.companyName")} htmlFor="cn"><Input id="cn" name="company.name" defaultValue={str("company.name")} required /></Field>
            <Field label={t("settings.companyAddress")} htmlFor="ca"><Input id="ca" name="company.address" defaultValue={str("company.address")} /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("settings.companyPhone")} htmlFor="cp"><Input id="cp" name="company.phone" defaultValue={str("company.phone")} dir="ltr" /></Field>
              <Field label={t("settings.companyEmail")} htmlFor="ce"><Input id="ce" name="company.email" defaultValue={str("company.email")} dir="ltr" /></Field>
            </div>
            <Field label={t("settings.companyTaxNumber")} htmlFor="ct"><Input id="ct" name="company.taxNumber" defaultValue={str("company.taxNumber")} dir="ltr" /></Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("settings.finance")}</CardTitle>
            <CardDescription>{t("settings.taxNote")}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("settings.currency")} htmlFor="cur"><Input id="cur" name="finance.currency" defaultValue={str("finance.currency")} maxLength={3} dir="ltr" required /></Field>
              <Field label={t("settings.defaultTaxRate")} htmlFor="tax"><Input id="tax" name="finance.defaultTaxRate" type="number" min={0} max={100} step="0.01" defaultValue={str("finance.defaultTaxRate")} dir="ltr" /></Field>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox name="finance.taxEnabledByDefault" defaultChecked={Boolean(values["finance.taxEnabledByDefault"])} />
              {t("settings.taxEnabledByDefault")}
            </label>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>{t("settings.sales")}</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label={t("settings.quotationValidityDays")} htmlFor="qv"><Input id="qv" name="sales.quotationValidityDays" type="number" min={1} max={365} defaultValue={str("sales.quotationValidityDays")} dir="ltr" /></Field>
            <Field label={t("settings.defaultDepositPercent")} htmlFor="dp"><Input id="dp" name="sales.defaultDepositPercent" type="number" min={0} max={100} step="0.01" defaultValue={str("sales.defaultDepositPercent")} dir="ltr" /></Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>{t("settings.production")}</CardTitle></CardHeader>
          <CardContent className="grid gap-4">
            <Field label={t("settings.defaultOverheadPercent")} htmlFor="oh"><Input id="oh" name="production.defaultOverheadPercent" type="number" min={0} max={500} step="0.01" defaultValue={str("production.defaultOverheadPercent")} dir="ltr" /></Field>
            <Field label={t("settings.qcChecklist")} htmlFor="qc">
              <Textarea id="qc" name="production.qcChecklist" rows={5} defaultValue={(values["production.qcChecklist"] as string[] | undefined)?.join("\n") ?? ""} />
            </Field>
          </CardContent>
        </Card>
      </fieldset>
      {!readOnly ? (
        <div className="lg:col-span-2">
          <Button type="submit" disabled={pending}>{t("common.save")}</Button>
        </div>
      ) : null}
    </form>
  );
}
