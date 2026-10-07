"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import { Plus, Trash2 } from "@/components/ui/material-icons";
import { toast } from "sonner";
import { formatNumber } from "@edge/i18n";
import { Button } from "@/components/ui/button";
import { Card, CardContent, Checkbox, Field, Input, NativeSelect, Textarea } from "@/components/ui/primitives";
import { useI18n } from "@/components/i18n-provider";
import { SearchPicker, type PickItem } from "@/components/search-picker";
import { api, ApiError } from "@/lib/api-client";

type Line = { k: number; material: PickItem | null; quantity: string; unitPrice: string; discount: string };
let seq = 0;
const blank = (p: Partial<Line> = {}): Line => ({ k: ++seq, material: null, quantity: "", unitPrice: "", discount: "0", ...p });

export function PurchaseOrderForm({ warehouses, initial }: {
  warehouses: { id: string; name: string }[];
  initial: { id?: string; supplier: PickItem | null; warehouseId: string; purchaseRequestId?: string | null; expectedDate: string; taxEnabled: boolean; taxRate: string; paymentTerms: string; notes: string; lines: Omit<Line, "k">[] };
}) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [supplier, setSupplier] = useState(initial.supplier);
  const [lines, setLines] = useState<Line[]>(initial.lines.length ? initial.lines.map((l) => blank(l)) : [blank()]);
  const [taxEnabled, setTaxEnabled] = useState(initial.taxEnabled);
  const [taxRate, setTaxRate] = useState(initial.taxRate);
  const [pending, setPending] = useState(false);
  const patch = (k: number, p: Partial<Line>) => setLines((ls) => ls.map((l) => (l.k === k ? { ...l, ...p } : l)));

  const totals = useMemo(() => {
    const sub = lines.reduce((s, l) => s + Math.max(0, Number(l.quantity || 0) * Number(l.unitPrice || 0) - Number(l.discount || 0)), 0);
    const tax = taxEnabled ? (sub * Number(taxRate || 0)) / 100 : 0;
    return { sub, tax, total: sub + tax };
  }, [lines, taxEnabled, taxRate]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!supplier) return;
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    setPending(true);
    try {
      const body = {
        supplierId: supplier.id, warehouseId: f.warehouseId, purchaseRequestId: initial.purchaseRequestId ?? null, expectedDate: f.expectedDate || null,
        taxEnabled, taxRate: Number(taxRate || 0), paymentTerms: f.paymentTerms || null, notes: f.notes || null,
        items: lines.filter((l) => l.material && l.quantity).map((l) => ({ materialId: l.material!.id, quantity: Number(l.quantity), unitPrice: Number(l.unitPrice || 0), discount: Number(l.discount || 0) })),
      };
      const res = await api<{ id: string }>(initial.id ? `/purchase-orders/${initial.id}` : "/purchase-orders", { method: initial.id ? "PUT" : "POST", body });
      toast.success(t("common.saved"));
      router.push(`/purchase-orders/${res.id}`);
      router.refresh();
    } catch (err) {
      toast.error(t(err instanceof ApiError ? err.body.messageKey : "errors.internal"));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <Card>
        <CardContent className="grid gap-4 pt-5 sm:grid-cols-3">
          <Field label={t("purchasing.supplier")} className="sm:col-span-2">
            <SearchPicker endpoint="/suppliers?status=ACTIVE" map={(r) => ({ id: String(r.id), label: String(r.name), sub: String(r.code) })} value={supplier} onChange={setSupplier} placeholder={t("common.searchPlaceholder")} />
          </Field>
          <Field label={t("purchasing.warehouse")}>
            <NativeSelect name="warehouseId" defaultValue={initial.warehouseId} required>
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </NativeSelect>
          </Field>
          <Field label={t("purchasing.expectedDate")}><Input name="expectedDate" type="date" dir="ltr" defaultValue={initial.expectedDate} /></Field>
          <label className="flex items-center gap-2 self-end pb-2 text-sm"><Checkbox checked={taxEnabled} onChange={(e) => setTaxEnabled(e.target.checked)} />{t("quotations.applyTax")}</label>
          {taxEnabled ? <Field label={t("quotations.taxRate")}><Input type="number" dir="ltr" min={0} max={100} step="0.01" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} /></Field> : <span />}
        </CardContent>
      </Card>
      <Card>
        <CardContent className="grid gap-2 pt-5">
          {lines.map((l) => (
            <div key={l.k} className="grid gap-2 sm:grid-cols-[1fr_110px_130px_110px_130px_auto] sm:items-center">
              <SearchPicker endpoint="/materials?status=ACTIVE" map={(r) => ({ id: String(r.id), label: String(r.name), sub: String(r.code) })} value={l.material} onChange={(v) => patch(l.k, { material: v })} placeholder={t("docs.material")} />
              <Input type="number" dir="ltr" min={0} step="any" placeholder={t("docs.qty")} value={l.quantity} onChange={(e) => patch(l.k, { quantity: e.target.value })} />
              <Input type="number" dir="ltr" min={0} step="any" placeholder={t("purchasing.unitPrice")} value={l.unitPrice} onChange={(e) => patch(l.k, { unitPrice: e.target.value })} />
              <Input type="number" dir="ltr" min={0} step="any" placeholder={t("docs.discount")} value={l.discount} onChange={(e) => patch(l.k, { discount: e.target.value })} />
              <span className="num text-end font-medium">{formatNumber(locale, Math.max(0, Number(l.quantity || 0) * Number(l.unitPrice || 0) - Number(l.discount || 0)))}</span>
              <Button type="button" size="icon" variant="ghost" onClick={() => setLines(lines.filter((x) => x.k !== l.k))}><Trash2 /></Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" className="justify-self-start" onClick={() => setLines([...lines, blank()])}><Plus />{t("inventory.addLine")}</Button>
          <dl className="ms-auto grid w-64 grid-cols-2 gap-1 border-t pt-2 text-sm">
            <dt className="text-muted-foreground">{t("docs.subtotal")}</dt><dd className="num text-end">{formatNumber(locale, totals.sub)}</dd>
            {taxEnabled ? <><dt className="text-muted-foreground">{t("docs.tax")}</dt><dd className="num text-end">{formatNumber(locale, totals.tax)}</dd></> : null}
            <dt className="font-semibold">{t("docs.total")}</dt><dd className="num text-end font-semibold">{formatNumber(locale, totals.total)}</dd>
          </dl>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="grid gap-4 pt-5 sm:grid-cols-2">
          <Field label={t("quotations.paymentTerms")}><Input name="paymentTerms" defaultValue={initial.paymentTerms} /></Field>
          <Field label={t("fields.notes")}><Textarea name="notes" defaultValue={initial.notes} /></Field>
        </CardContent>
      </Card>
      <div><Button type="submit" disabled={pending || !supplier}>{t("common.save")}</Button></div>
    </form>
  );
}
