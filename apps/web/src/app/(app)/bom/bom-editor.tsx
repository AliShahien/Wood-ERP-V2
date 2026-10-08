"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Plus, Trash2 } from "@/components/ui/material-icons";
import { toast } from "sonner";
import { formatNumber } from "@edge/i18n";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, Checkbox, Field, Input, NativeSelect, Table, Td, Th, Tr } from "@/components/ui/primitives";
import { useI18n } from "@/components/i18n-provider";
import { SearchPicker, type PickItem } from "@/components/search-picker";
import { api, ApiError } from "@/lib/api-client";

type Rule = { key: string; expression: string };
type Item = { k: number; material: PickItem | null; quantityType: "FIXED" | "FORMULA"; fixedQuantity: string; formula: string; perUnit: boolean; wastePercent: string; conditionOptionId: string };

export interface BomEditorProps {
  bomId?: string;
  productId: string;
  readOnly: boolean;
  options: { id: string; name: string }[];
  initial: { name: string; laborCostPerUnit: string; overheadPercent: string; rules: Rule[]; items: Omit<Item, "k">[] };
  defaults: { width: string; height: string; thickness: string };
}

let k = 0;

export function BomEditor({ bomId, productId, readOnly, options, initial, defaults }: BomEditorProps) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [head, setHead] = useState({ name: initial.name, laborCostPerUnit: initial.laborCostPerUnit, overheadPercent: initial.overheadPercent });
  const [rules, setRules] = useState<Rule[]>(initial.rules);
  const [items, setItems] = useState<Item[]>(initial.items.map((i) => ({ ...i, k: ++k })));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [calc, setCalc] = useState({ ...defaults, quantity: "1" });
  const [result, setResult] = useState<null | { requirements: { materialName: string; unit: string; quantity: string; cost?: string }[]; materialCost?: string; laborCost?: string; overheadCost?: string; totalCost?: string }>(null);

  const patchItem = (key: number, p: Partial<Item>) => setItems((xs) => xs.map((x) => (x.k === key ? { ...x, ...p } : x)));

  async function save() {
    setPending(true);
    setErrors({});
    try {
      const body = {
        productId, name: head.name, laborCostPerUnit: Number(head.laborCostPerUnit || 0), overheadPercent: Number(head.overheadPercent || 0),
        rules: rules.filter((r) => r.key && r.expression),
        items: items.filter((i) => i.material).map((i) => ({
          materialId: i.material!.id, quantityType: i.quantityType, fixedQuantity: i.quantityType === "FIXED" ? Number(i.fixedQuantity) : null,
          formula: i.quantityType === "FORMULA" ? i.formula : null, perUnit: i.perUnit, wastePercent: Number(i.wastePercent || 0), conditionOptionId: i.conditionOptionId || null,
        })),
      };
      const res = await api<{ id: string }>(bomId ? `/boms/${bomId}` : "/boms", { method: bomId ? "PUT" : "POST", body });
      toast.success(t("common.saved"));
      router.push(`/bom/${res.id}`);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        const map: Record<string, string> = {};
        for (const d of (err.body.details as { path: string; message?: string; code: string }[]) ?? []) map[d.path] = d.message || d.code;
        setErrors(map);
        toast.error(t(err.body.messageKey));
      }
    } finally {
      setPending(false);
    }
  }

  async function preview() {
    if (!bomId) return;
    try {
      setResult(await api(`/boms/${bomId}/preview`, { body: { width: Number(calc.width), height: Number(calc.height), thickness: calc.thickness ? Number(calc.thickness) : undefined, quantity: Number(calc.quantity || 1) } }));
    } catch (err) {
      toast.error(t(err instanceof ApiError ? err.body.messageKey : "errors.internal"));
    }
  }

  const f = (v: string | undefined) => (v === undefined ? "—" : formatNumber(locale, Number(v), 2));

  return (
    <div className="grid gap-4">
      <Card>
        <CardContent className="grid gap-4 pt-5 sm:grid-cols-2">
          <Field label={t("bom.name")} className="sm:col-span-2"><Input value={head.name} onChange={(e) => setHead({ ...head, name: e.target.value })} disabled={readOnly} /></Field>
          <Field label={t("bom.laborCostPerUnit")}><Input type="number" dir="ltr" min={0} value={head.laborCostPerUnit} onChange={(e) => setHead({ ...head, laborCostPerUnit: e.target.value })} disabled={readOnly} /></Field>
          <Field label={t("bom.overheadPercent")}><Input type="number" dir="ltr" min={0} value={head.overheadPercent} onChange={(e) => setHead({ ...head, overheadPercent: e.target.value })} disabled={readOnly} /></Field>
          <p className="text-xs text-muted-foreground sm:col-span-2">{t("bom.variablesHelp")}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>{t("bom.rules")}</CardTitle>
          {!readOnly ? <Button size="sm" variant="outline" onClick={() => setRules([...rules, { key: "", expression: "" }])}><Plus />{t("bom.addRule")}</Button> : null}
        </CardHeader>
        <CardContent className="grid gap-3">
          {rules.map((r, i) => (
            <div key={i} className="grid gap-3 rounded-2xl border bg-muted/20 p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] sm:items-end">
              <Field label={t("bom.ruleKey")} error={errors[`rules.${i}.key`]}><Input dir="ltr" value={r.key} disabled={readOnly} onChange={(e) => setRules(rules.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)))} aria-invalid={Boolean(errors[`rules.${i}.key`])} /></Field>
              <Field label={t("bom.expression")} error={errors[`rules.${i}.expression`]}><Input dir="ltr" className="font-mono" placeholder="W * H / 1000000" value={r.expression} disabled={readOnly} onChange={(e) => setRules(rules.map((x, j) => (j === i ? { ...x, expression: e.target.value } : x)))} aria-invalid={Boolean(errors[`rules.${i}.expression`])} /></Field>
              {!readOnly ? <Button size="icon" variant="ghost" className="justify-self-end" onClick={() => setRules(rules.filter((_, j) => j !== i))} aria-label={t("common.delete")}><Trash2 /></Button> : null}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>{t("bom.items")}</CardTitle>
          {!readOnly ? <Button size="sm" variant="outline" onClick={() => setItems([...items, { k: ++k, material: null, quantityType: "FIXED", fixedQuantity: "1", formula: "", perUnit: true, wastePercent: "0", conditionOptionId: "" }])}><Plus />{t("bom.addItem")}</Button> : null}
        </CardHeader>
        <CardContent className="grid gap-3">
          {items.map((it, i) => (
            <div key={it.k} className="grid gap-3 rounded-2xl border bg-muted/20 p-4 sm:grid-cols-2 lg:grid-cols-3 lg:items-end">
              <Field label={t("bom.material")} className="sm:col-span-2 lg:col-span-3"><SearchPicker endpoint="/materials?status=ACTIVE" map={(r) => ({ id: String(r.id), label: String(r.name), sub: String(r.code) })} value={it.material} onChange={(v) => patchItem(it.k, { material: v })} placeholder={t("bom.material")} disabled={readOnly} /></Field>
              <Field label={t("bom.quantityType")}><NativeSelect value={it.quantityType} disabled={readOnly} onChange={(e) => patchItem(it.k, { quantityType: e.target.value as Item["quantityType"] })}>
                <option value="FIXED">{t("status.BomQuantityType.FIXED")}</option>
                <option value="FORMULA">{t("status.BomQuantityType.FORMULA")}</option>
              </NativeSelect></Field>
              {it.quantityType === "FIXED" ? (
                <Field label={t("bom.fixedQuantity")} error={errors[`items.${i}.fixedQuantity`]}><Input type="number" dir="ltr" step="any" min={0} value={it.fixedQuantity} disabled={readOnly} onChange={(e) => patchItem(it.k, { fixedQuantity: e.target.value })} aria-invalid={Boolean(errors[`items.${i}.fixedQuantity`])} /></Field>
              ) : (
                <Field label={t("bom.expression")} error={errors[`items.${i}.formula`]}><Input dir="ltr" className="font-mono" placeholder="area * 2" value={it.formula} disabled={readOnly} onChange={(e) => patchItem(it.k, { formula: e.target.value })} aria-invalid={Boolean(errors[`items.${i}.formula`])} /></Field>
              )}
              <Field label={t("bom.waste")}><Input type="number" dir="ltr" min={0} max={100} value={it.wastePercent} disabled={readOnly} onChange={(e) => patchItem(it.k, { wastePercent: e.target.value })} /></Field>
              <Field label={t("bom.condition")}><NativeSelect value={it.conditionOptionId} disabled={readOnly} onChange={(e) => patchItem(it.k, { conditionOptionId: e.target.value })}>
                <option value="">—</option>
                {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </NativeSelect></Field>
              <div className="flex items-center justify-between gap-3 sm:col-span-2 lg:col-span-1">
                <label className="flex items-center gap-2 text-sm"><Checkbox checked={it.perUnit} disabled={readOnly} onChange={(e) => patchItem(it.k, { perUnit: e.target.checked })} />{t("bom.perUnit")}</label>
                {!readOnly ? <Button size="icon" variant="ghost" onClick={() => setItems(items.filter((x) => x.k !== it.k))} aria-label={t("common.delete")}><Trash2 /></Button> : null}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
      {!readOnly ? <div><Button onClick={save} disabled={pending}>{t("common.save")}</Button></div> : null}

      {bomId ? (
        <Card>
          <CardHeader><CardTitle>{t("bom.preview")}</CardTitle></CardHeader>
          <CardContent className="grid gap-3">
            <div className="flex flex-wrap items-end gap-2">
              <Field label="W"><Input className="w-28" dir="ltr" type="number" value={calc.width} onChange={(e) => setCalc({ ...calc, width: e.target.value })} /></Field>
              <Field label="H"><Input className="w-28" dir="ltr" type="number" value={calc.height} onChange={(e) => setCalc({ ...calc, height: e.target.value })} /></Field>
              <Field label="T"><Input className="w-24" dir="ltr" type="number" value={calc.thickness} onChange={(e) => setCalc({ ...calc, thickness: e.target.value })} /></Field>
              <Field label="Q"><Input className="w-20" dir="ltr" type="number" value={calc.quantity} onChange={(e) => setCalc({ ...calc, quantity: e.target.value })} /></Field>
              <Button variant="secondary" onClick={preview}>{t("bom.calculate")}</Button>
            </div>
            {result ? (
              <Table>
                <thead><tr className="border-b"><Th>{t("bom.material")}</Th><Th className="text-end">{t("bom.required")}</Th><Th>{t("fields.unit")}</Th>{result.totalCost !== undefined ? <Th className="text-end">{t("bom.cost")}</Th> : null}</tr></thead>
                <tbody>
                  {result.requirements.map((r, i) => (
                    <Tr key={i}><Td>{r.materialName}</Td><Td className="num text-end">{formatNumber(locale, Number(r.quantity), 4)}</Td><Td>{r.unit}</Td>{r.cost !== undefined ? <Td className="num text-end">{f(r.cost)}</Td> : null}</Tr>
                  ))}
                  {result.totalCost !== undefined ? (
                    <>
                      <Tr><Td colSpan={3}>{t("bom.materialCost")}</Td><Td className="num text-end">{f(result.materialCost)}</Td></Tr>
                      <Tr><Td colSpan={3}>{t("bom.laborCost")}</Td><Td className="num text-end">{f(result.laborCost)}</Td></Tr>
                      <Tr><Td colSpan={3}>{t("bom.overheadCost")}</Td><Td className="num text-end">{f(result.overheadCost)}</Td></Tr>
                      <Tr><Td colSpan={3} className="font-semibold">{t("bom.totalCost")}</Td><Td className="num text-end font-semibold">{f(result.totalCost)}</Td></Tr>
                    </>
                  ) : null}
                </tbody>
              </Table>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
