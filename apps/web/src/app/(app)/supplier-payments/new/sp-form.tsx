"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, Field, Input, NativeSelect, Textarea } from "@/components/ui/primitives";
import { useI18n } from "@/components/i18n-provider";
import { SearchPicker, type PickItem } from "@/components/search-picker";
import { api, ApiError } from "@/lib/api-client";

type Inv = { id: string; number: string; remaining: number };

export function SupplierPaymentForm({ accounts, supplier: initialSupplier, invoices: initialInvoices, invoiceId }: { accounts: { id: string; name: string }[]; supplier: PickItem | null; invoices: Inv[]; invoiceId: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [supplier, setSupplier] = useState(initialSupplier);
  const [invoices, setInvoices] = useState(initialInvoices);
  const [inv, setInv] = useState(invoiceId);
  const [amount, setAmount] = useState(() => String(initialInvoices.find((i) => i.id === invoiceId)?.remaining ?? ""));
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!supplier || supplier.id === initialSupplier?.id) return;
    api<{ items: { id: string; number: string; total: string; paidAmount: string; status: string }[] }>(`/supplier-invoices?supplierId=${supplier.id}&pageSize=50`)
      .then((r) => setInvoices(r.items.filter((i) => i.status === "POSTED" || i.status === "PARTIALLY_PAID").map((i) => ({ id: i.id, number: i.number, remaining: Number(i.total) - Number(i.paidAmount) }))))
      .catch(() => setInvoices([]));
  }, [supplier, initialSupplier]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!supplier) return;
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    setPending(true);
    try {
      const res = await api<{ id: string }>("/supplier-payments", {
        body: { supplierId: supplier.id, supplierInvoiceId: inv || null, cashAccountId: f.cashAccountId, amount: Number(amount), method: f.method, paymentDate: f.paymentDate || undefined, reference: f.reference || null, notes: f.notes || null },
      });
      router.push(`/supplier-payments/${res.id}`);
    } catch (err) {
      toast.error(t(err instanceof ApiError ? err.body.messageKey : "errors.internal", (err instanceof ApiError ? (err.body.details as Record<string, string>) : undefined) ?? undefined));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid max-w-3xl gap-4">
      <Card>
        <CardContent className="grid gap-4 pt-5 sm:grid-cols-2">
          <Field label={t("purchasing.supplier")} className="sm:col-span-2"><SearchPicker endpoint="/suppliers" map={(r) => ({ id: String(r.id), label: String(r.name), sub: String(r.code) })} value={supplier} onChange={setSupplier} placeholder={t("common.searchPlaceholder")} /></Field>
          <Field label={t("purchasing.invoice")}>
            <NativeSelect value={inv} onChange={(e) => { setInv(e.target.value); const r = invoices.find((i) => i.id === e.target.value); if (r) setAmount(String(r.remaining)); }}>
              <option value="">{t("fields.none")}</option>
              {invoices.map((i) => <option key={i.id} value={i.id}>{i.number} — {i.remaining.toFixed(2)}</option>)}
            </NativeSelect>
          </Field>
          <Field label={t("payments.amount")}><Input type="number" dir="ltr" min="0.01" step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
          <Field label={t("payments.method")}><NativeSelect name="method" defaultValue="BANK_TRANSFER">{["CASH", "BANK_TRANSFER", "CARD", "OTHER"].map((m) => <option key={m} value={m}>{t(`status.PaymentMethod.${m}`)}</option>)}</NativeSelect></Field>
          <Field label={t("payments.account")}><NativeSelect name="cashAccountId" required>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</NativeSelect></Field>
          <Field label={t("payments.date")}><Input name="paymentDate" type="date" dir="ltr" defaultValue={new Date().toISOString().slice(0, 10)} /></Field>
          <Field label={t("payments.reference")}><Input name="reference" dir="ltr" /></Field>
          <Field label={t("fields.notes")} className="sm:col-span-2"><Textarea name="notes" /></Field>
        </CardContent>
      </Card>
      <div><Button type="submit" disabled={pending || !supplier}>{t("common.save")}</Button></div>
    </form>
  );
}
