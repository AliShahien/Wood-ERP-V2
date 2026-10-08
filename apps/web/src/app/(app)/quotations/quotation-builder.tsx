"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "@/components/ui/material-icons";
import { toast } from "sonner";
import { formatNumber } from "@edge/i18n";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, Checkbox, Field, Input, NativeSelect, Textarea } from "@/components/ui/primitives";
import { useI18n } from "@/components/i18n-provider";
import { SearchPicker, type PickItem } from "@/components/search-picker";
import { api, ApiError } from "@/lib/api-client";

type ProductOpt = { optionId: string; isDefault: boolean; option: { id: string; type: string; name: string } };
type ProductInfo = {
  id: string; code: string; name: string; defaultWidth: string | null; defaultHeight: string | null; defaultThickness: string | null;
  minWidth: string | null; maxWidth: string | null; minHeight: string | null; maxHeight: string | null; availableOptions: ProductOpt[];
};
type Line = {
  key: string; product: ProductInfo | null; width: string; height: string; thickness: string; quantity: string;
  optionIds: string[]; unitPrice: string; overridden: boolean; discount: string; description: string; measurementId: string | null;
};

export interface BuilderInitial {
  id?: string;
  customer: PickItem | null;
  lines: Omit<Line, "key">[];
  discountType: "AMOUNT" | "PERCENT";
  discountValue: string;
  installationCharge: string;
  transportationCharge: string;
  taxEnabled: boolean;
  taxRate: string;
  depositRequired: string;
  validUntil: string;
  paymentTerms: string;
  notes: string;
}

let seq = 0;
const newKey = () => `l${++seq}`;

export function QuotationBuilder({ initial, canOverride }: { initial: BuilderInitial; canOverride: boolean }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [customer, setCustomer] = useState<PickItem | null>(initial.customer);
  const [lines, setLines] = useState<Line[]>(() => initial.lines.map((l) => ({ ...l, key: newKey() })));
  const [h, setH] = useState(() => ({
    discountType: initial.discountType, discountValue: initial.discountValue, installationCharge: initial.installationCharge,
    transportationCharge: initial.transportationCharge, taxEnabled: initial.taxEnabled, taxRate: initial.taxRate,
    depositRequired: initial.depositRequired, validUntil: initial.validUntil, paymentTerms: initial.paymentTerms, notes: initial.notes,
  }));
  const [preview, setPreview] = useState<{ lines: { unitPrice: string; lineTotal: string }[]; subtotal: string; discountTotal: string; taxTotal: string; total: string; depositRequired: string; currency: string } | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const fmt = (v: string | number | undefined) => formatNumber(locale, Number(v ?? 0));
  const patch = (key: string, p: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...p } : l)));

  async function pickProduct(key: string, item: PickItem | null) {
    if (!item) return patch(key, { product: null, optionIds: [] });
    const p = await api<ProductInfo>(`/products/${item.id}`);
    patch(key, {
      product: p,
      width: p.defaultWidth ?? "", height: p.defaultHeight ?? "", thickness: p.defaultThickness ?? "",
      optionIds: p.availableOptions.filter((o) => o.isDefault).map((o) => o.optionId),
      overridden: false,
    });
  }

  const body = useCallback(
    (forSave: boolean) => ({
      customerId: customer?.id,
      items: lines.filter((l) => l.product).map((l) => ({
        productId: l.product!.id, width: Number(l.width), height: Number(l.height), thickness: l.thickness ? Number(l.thickness) : null,
        quantity: Number(l.quantity), optionIds: l.optionIds, discount: Number(l.discount || 0),
        unitPrice: l.overridden && l.unitPrice !== "" ? Number(l.unitPrice) : null,
        description: l.description || null, measurementId: l.measurementId,
      })),
      discountType: h.discountType, discountValue: Number(h.discountValue || 0), installationCharge: Number(h.installationCharge || 0),
      transportationCharge: Number(h.transportationCharge || 0), taxEnabled: h.taxEnabled, taxRate: Number(h.taxRate || 0),
      depositRequired: h.depositRequired === "" ? null : Number(h.depositRequired),
      ...(forSave ? { validUntil: h.validUntil || undefined, paymentTerms: h.paymentTerms || null, notes: h.notes || null } : {}),
    }),
    [customer, lines, h],
  );

  const ready = useMemo(() => lines.some((l) => l.product) && lines.every((l) => !l.product || (Number(l.width) > 0 && Number(l.height) > 0 && Number(l.quantity) > 0)), [lines]);

  useEffect(() => {
    if (!ready) return setPreview(null);
    const timer = setTimeout(async () => {
      try {
        setPreview(await api("/quotations/preview", { body: body(false) }));
        setPreviewError(null);
      } catch (err) {
        setPreview(null);
        setPreviewError(t(err instanceof ApiError ? err.body.messageKey : "errors.internal"));
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [ready, body, t]);

  async function save() {
    if (!customer) return toast.error(t("quotations.noCustomer"));
    setSaving(true);
    try {
      const res = await api<{ id: string }>(initial.id ? `/quotations/${initial.id}` : "/quotations", { method: initial.id ? "PUT" : "POST", body: body(true) });
      toast.success(t("common.saved"));
      router.push(`/quotations/${res.id}`);
      router.refresh();
    } catch (err) {
      toast.error(t(err instanceof ApiError ? err.body.messageKey : "errors.internal"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="grid content-start gap-4">
        <Card>
          <CardHeader><CardTitle>{t("quotations.customer")}</CardTitle></CardHeader>
          <CardContent>
            <SearchPicker
              endpoint="/customers?status=ACTIVE"
              map={(r) => ({ id: String(r.id), label: String(r.name), sub: [r.code, r.phone].filter(Boolean).join(" · ") })}
              value={customer}
              onChange={setCustomer}
              placeholder={t("quotations.selectCustomer")}
            />
          </CardContent>
        </Card>

        {lines.map((l, idx) => {
          const pv = preview?.lines[lines.filter((x) => x.product).indexOf(l)];
          const groups = new Map<string, ProductOpt[]>();
          for (const o of l.product?.availableOptions ?? []) groups.set(o.option.type, [...(groups.get(o.option.type) ?? []), o]);
          return (
            <Card key={l.key}>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle><span className="num">{idx + 1}.</span> {l.product ? <span dir="ltr">{l.product.name}</span> : t("quotations.product")}</CardTitle>
                <Button variant="ghost" size="icon" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} aria-label={t("common.delete")}><Trash2 /></Button>
              </CardHeader>
              <CardContent className="grid gap-4">
                <Field label={t("quotations.product")}><SearchPicker
                  endpoint="/products?status=ACTIVE"
                  map={(r) => ({ id: String(r.id), label: String(r.name), sub: String(r.code) })}
                  value={l.product ? { id: l.product.id, label: l.product.name, sub: l.product.code } : null}
                  onChange={(v) => void pickProduct(l.key, v)}
                  placeholder={t("common.searchPlaceholder")}
                /></Field>
                {l.product ? (
                  <>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label={t("quotations.width")}><Input type="number" dir="ltr" value={l.width} onChange={(e) => patch(l.key, { width: e.target.value })} min={l.product.minWidth ?? 1} max={l.product.maxWidth ?? undefined} /></Field>
                      <Field label={t("quotations.height")}><Input type="number" dir="ltr" value={l.height} onChange={(e) => patch(l.key, { height: e.target.value })} min={l.product.minHeight ?? 1} max={l.product.maxHeight ?? undefined} /></Field>
                      <Field label={t("quotations.thickness")}><Input type="number" dir="ltr" value={l.thickness} onChange={(e) => patch(l.key, { thickness: e.target.value })} /></Field>
                      <Field label={t("quotations.quantity")}><Input type="number" dir="ltr" min={1} value={l.quantity} onChange={(e) => patch(l.key, { quantity: e.target.value })} /></Field>
                    </div>
                    {[...groups.entries()].map(([type, opts]) => (
                      <div key={type}>
                        <p className="mb-1.5 text-sm font-medium">{t(`status.OptionType.${type}`)}</p>
                        <div className="flex flex-wrap gap-2">
                          {opts.map((o) => {
                            const on = l.optionIds.includes(o.optionId);
                            return (
                              <label key={o.optionId} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm ${on ? "border-primary bg-primary/10" : "bg-muted/20"}`}>
                                <Checkbox checked={on} onChange={() => patch(l.key, { optionIds: on ? l.optionIds.filter((x) => x !== o.optionId) : [...l.optionIds, o.optionId] })} />
                                {o.option.name}
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label={t("quotations.unitPrice")} hint={pv && l.overridden ? `${t("quotations.calculated")}: ${fmt(pv.unitPrice)}` : undefined}>
                        <Input
                          type="number" dir="ltr" step="0.01"
                          value={l.overridden ? l.unitPrice : pv?.unitPrice ?? ""}
                          readOnly={!canOverride}
                          onChange={(e) => patch(l.key, { unitPrice: e.target.value, overridden: true })}
                        />
                      </Field>
                      <Field label={t("quotations.lineDiscount")}><Input type="number" dir="ltr" min={0} step="0.01" value={l.discount} onChange={(e) => patch(l.key, { discount: e.target.value })} /></Field>
                      <Field label={t("quotations.lineTotal")} className="sm:col-span-2"><div className="num flex min-h-12 items-center rounded-xl border bg-muted/30 px-4 text-base font-semibold">{pv ? fmt(pv.lineTotal) : "—"}</div></Field>
                    </div>
                    <Field label={t("fields.description")}><Input value={l.description} onChange={(e) => patch(l.key, { description: e.target.value })} /></Field>
                  </>
                ) : null}
              </CardContent>
            </Card>
          );
        })}
        <Button variant="outline" className="justify-self-start" onClick={() => setLines((ls) => [...ls, { key: newKey(), product: null, width: "", height: "", thickness: "", quantity: "1", optionIds: [], unitPrice: "", overridden: false, discount: "0", description: "", measurementId: null }])}>
          <Plus />{t("quotations.addItem")}
        </Button>

        <Card>
          <CardContent className="grid gap-4 pt-5 sm:grid-cols-2">
            <Field label={t("quotations.validUntil")}><Input type="date" dir="ltr" value={h.validUntil} onChange={(e) => setH({ ...h, validUntil: e.target.value })} /></Field>
            <Field label={t("quotations.paymentTerms")}><Input value={h.paymentTerms} onChange={(e) => setH({ ...h, paymentTerms: e.target.value })} /></Field>
            <Field label={t("fields.notes")} className="sm:col-span-2"><Textarea value={h.notes} onChange={(e) => setH({ ...h, notes: e.target.value })} /></Field>
          </CardContent>
        </Card>
      </div>

      <div className="xl:sticky xl:top-20 xl:self-start">
        <Card>
          <CardHeader><CardTitle>{t("quotations.total")}</CardTitle></CardHeader>
          <CardContent className="grid gap-3 text-sm">
            <div className="grid grid-cols-[1fr_110px] items-end gap-2">
              <Field label={t("quotations.discount")}><Input type="number" dir="ltr" min={0} value={h.discountValue} onChange={(e) => setH({ ...h, discountValue: e.target.value })} /></Field>
              <NativeSelect value={h.discountType} onChange={(e) => setH({ ...h, discountType: e.target.value as "AMOUNT" | "PERCENT" })}>
                <option value="AMOUNT">{t("status.DiscountType.AMOUNT")}</option>
                <option value="PERCENT">%</option>
              </NativeSelect>
            </div>
            <Field label={t("quotations.installation")}><Input type="number" dir="ltr" min={0} value={h.installationCharge} onChange={(e) => setH({ ...h, installationCharge: e.target.value })} /></Field>
            <Field label={t("quotations.transportation")}><Input type="number" dir="ltr" min={0} value={h.transportationCharge} onChange={(e) => setH({ ...h, transportationCharge: e.target.value })} /></Field>
            <label className="flex min-h-12 items-center gap-3 rounded-xl border bg-muted/40 px-4 font-medium"><Checkbox checked={h.taxEnabled} onChange={(e) => setH({ ...h, taxEnabled: e.target.checked })} />{t("quotations.applyTax")}</label>
            {h.taxEnabled ? <Field label={t("quotations.taxRate")}><Input type="number" dir="ltr" min={0} max={100} step="0.01" value={h.taxRate} onChange={(e) => setH({ ...h, taxRate: e.target.value })} /></Field> : null}
            <Field label={t("quotations.deposit")}><Input type="number" dir="ltr" min={0} placeholder={preview ? fmt(preview.depositRequired) : ""} value={h.depositRequired} onChange={(e) => setH({ ...h, depositRequired: e.target.value })} /></Field>
            <dl className="grid grid-cols-2 gap-y-1.5 border-t pt-3">
              <dt className="text-muted-foreground">{t("quotations.subtotal")}</dt><dd className="num text-end">{preview ? fmt(preview.subtotal) : "—"}</dd>
              <dt className="text-muted-foreground">{t("quotations.discount")}</dt><dd className="num text-end">{preview ? fmt(preview.discountTotal) : "—"}</dd>
              {h.taxEnabled ? <><dt className="text-muted-foreground">{t("quotations.tax")}</dt><dd className="num text-end">{preview ? fmt(preview.taxTotal) : "—"}</dd></> : null}
              <dt className="text-base font-semibold">{t("quotations.total")}</dt><dd className="num text-end text-base font-semibold">{preview ? `${fmt(preview.total)} ${preview.currency}` : "—"}</dd>
            </dl>
            {previewError ? <p className="text-xs text-destructive">{previewError}</p> : null}
            <Button onClick={save} disabled={saving || !customer || !ready} size="lg">{t("common.save")}</Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
