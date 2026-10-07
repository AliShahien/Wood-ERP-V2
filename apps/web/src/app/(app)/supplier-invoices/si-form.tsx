"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import { Plus, Trash2 } from "@/components/ui/material-icons";
import { toast } from "sonner";
import { formatNumber } from "@edge/i18n";
import { Button } from "@/components/ui/button";
import { Card, CardContent, Checkbox, Field, Input, Textarea } from "@/components/ui/primitives";
import { useI18n } from "@/components/i18n-provider";
import { SearchPicker, type PickItem } from "@/components/search-picker";
import { api, ApiError } from "@/lib/api-client";

type Line = { k: number; materialId: string | null; description: string; quantity: string; unitPrice: string; discount: string };
let seq = 0;

export function SupplierInvoiceForm({ initial }: {
  initial: { supplier: PickItem | null; purchaseOrderId: string | null; taxEnabled: boolean; taxRate: string; lines: Omit<Line, "k">[] };
}) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [supplier, setSupplier] = useState(initial.supplier);
  const [lines, setLines] = useState<Line[]>(initial.lines.length ? initial.lines.map((l) => ({ ...l, k: ++seq })) : [{ k: ++seq, materialId: null, description: "", quantity: "1", unitPrice: "", discount: "0" }]);
  const [taxEnabled, setTaxEnabled] = useState(initial.taxEnabled);
  const [taxRate, setTaxRate] = useState(initial.taxRate);
  const [pending, setPending] = useState(false);
  const patch = (k: number, p: Partial<Line>) => setLines((ls) => ls.map((l) => (l.k === k ? { ...l, ...p } : l)));
  const sub = useMemo(() => lines.reduce((s, l) => s + Math.max(0, Number(l.quantity || 0) * Number(l.unitPrice || 0) - Number(l.discount || 0)), 0), [lines]);
  const tax = taxEnabled ? (sub * Number(taxRate || 0)) / 100 : 0;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!supplier) return;
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    setPending(true);
    try {
      const res = await api<{ id: string }>("/supplier-invoices", {
        body: {
          supplierId: supplier.id, purchaseOrderId: initial.purchaseOrderId, supplierInvoiceNo: f.supplierInvoiceNo || null, invoiceDate: f.invoiceDate || undefined,
          dueDate: f.dueDate || null, taxEnabled, taxRate: Number(taxRate || 0), notes: f.notes || null,
          items: lines.filter((l) => l.description && l.quantity).map((l) => ({ materialId: l.materialId, description: l.description, quantity: Number(l.quantity), unitPrice: Number(l.unitPrice || 0), discount: Number(l.discount || 0) })),
        },
      });
      router.push(`/supplier-invoices/${res.id}`);
    } catch (err) {
      toast.error(t(err instanceof ApiError ? err.body.messageKey : "errors.internal"));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <Card>
        <CardContent className="grid gap-4 pt-5 sm:grid-cols-2 lg:grid-cols-4">
          <Field label={t("purchasing.supplier")} className="lg:col-span-2"><SearchPicker endpoint="/suppliers" map={(r) => ({ id: String(r.id), label: String(r.name), sub: String(r.code) })} value={supplier} onChange={setSupplier} placeholder={t("common.searchPlaceholder")} disabled={Boolean(initial.purchaseOrderId)} /></Field>
          <Field label={t("purchasing.supplierInvoiceNo")}><Input name="supplierInvoiceNo" dir="ltr" /></Field>
          <Field label={t("invoices.invoiceDate")}><Input name="invoiceDate" type="date" dir="ltr" defaultValue={new Date().toISOString().slice(0, 10)} /></Field>
          <Field label={t("invoices.dueDate")}><Input name="dueDate" type="date" dir="ltr" /></Field>
          <label className="flex items-center gap-2 self-end pb-2 text-sm"><Checkbox checked={taxEnabled} onChange={(e) => setTaxEnabled(e.target.checked)} />{t("quotations.applyTax")}</label>
          {taxEnabled ? <Field label={t("quotations.taxRate")}><Input type="number" dir="ltr" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} /></Field> : null}
        </CardContent>
      </Card>
      <Card>
        <CardContent className="grid gap-2 pt-5">
          {lines.map((l) => (
            <div key={l.k} className="grid gap-2 sm:grid-cols-[1fr_100px_130px_110px_auto]">
              <Input placeholder={t("purchasing.description")} value={l.description} onChange={(e) => patch(l.k, { description: e.target.value })} />
              <Input type="number" dir="ltr" step="any" placeholder={t("docs.qty")} value={l.quantity} onChange={(e) => patch(l.k, { quantity: e.target.value })} />
              <Input type="number" dir="ltr" step="any" placeholder={t("purchasing.unitPrice")} value={l.unitPrice} onChange={(e) => patch(l.k, { unitPrice: e.target.value })} />
              <Input type="number" dir="ltr" step="any" placeholder={t("docs.discount")} value={l.discount} onChange={(e) => patch(l.k, { discount: e.target.value })} />
              <Button type="button" size="icon" variant="ghost" onClick={() => setLines(lines.filter((x) => x.k !== l.k))}><Trash2 /></Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" className="justify-self-start" onClick={() => setLines([...lines, { k: ++seq, materialId: null, description: "", quantity: "1", unitPrice: "", discount: "0" }])}><Plus />{t("inventory.addLine")}</Button>
          <dl className="ms-auto grid w-64 grid-cols-2 gap-1 border-t pt-2 text-sm">
            <dt className="text-muted-foreground">{t("docs.subtotal")}</dt><dd className="num text-end">{formatNumber(locale, sub)}</dd>
            {taxEnabled ? <><dt className="text-muted-foreground">{t("docs.tax")}</dt><dd className="num text-end">{formatNumber(locale, tax)}</dd></> : null}
            <dt className="font-semibold">{t("docs.total")}</dt><dd className="num text-end font-semibold">{formatNumber(locale, sub + tax)}</dd>
          </dl>
        </CardContent>
      </Card>
      <Card><CardContent className="pt-5"><Field label={t("fields.notes")}><Textarea name="notes" /></Field></CardContent></Card>
      <div><Button type="submit" disabled={pending || !supplier}>{t("common.save")}</Button></div>
    </form>
  );
}
