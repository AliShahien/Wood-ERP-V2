"use client";

import { Plus, Trash2 } from "@/components/ui/material-icons";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/primitives";
import { useI18n } from "@/components/i18n-provider";
import { SearchPicker, type PickItem } from "@/components/search-picker";

export type MaterialLine = { k: number; material: PickItem | null; quantity: string; unitCost: string; extra?: string };

let seq = 0;
export const newLine = (p: Partial<MaterialLine> = {}): MaterialLine => ({ k: ++seq, material: null, quantity: "", unitCost: "", ...p });

/** Editable material lines (picker + quantity [+ unit cost]). */
export function MaterialLines({ lines, onChange, withCost, costLabel, qtyLabel, allowNegative }: {
  lines: MaterialLine[];
  onChange: (l: MaterialLine[]) => void;
  withCost?: boolean;
  costLabel?: string;
  qtyLabel?: string;
  allowNegative?: boolean;
}) {
  const { t } = useI18n();
  const patch = (k: number, p: Partial<MaterialLine>) => onChange(lines.map((l) => (l.k === k ? { ...l, ...p } : l)));
  return (
    <div className="grid gap-3">
      {lines.map((l) => (
        <div key={l.k} className="grid gap-3 rounded-2xl border bg-muted/20 p-4 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
          <Field label={t("docs.material")} className="sm:col-span-2 lg:col-span-1">
            <SearchPicker endpoint="/materials?status=ACTIVE" map={(r) => ({ id: String(r.id), label: String(r.name), sub: `${r.code} · ${(r.unit as { name: string })?.name ?? ""}` })} value={l.material} onChange={(v) => patch(l.k, { material: v })} placeholder={t("docs.material")} />
          </Field>
          <Field label={qtyLabel ?? t("docs.qty")}>
            <Input type="number" dir="ltr" step="any" min={allowNegative ? undefined : 0} value={l.quantity} onChange={(e) => patch(l.k, { quantity: e.target.value })} />
          </Field>
          {withCost ? <Field label={costLabel ?? t("inventory.unitCost")}><Input type="number" dir="ltr" step="any" min={0} value={l.unitCost} onChange={(e) => patch(l.k, { unitCost: e.target.value })} /></Field> : null}
          <Button type="button" size="icon" variant="ghost" className="justify-self-end" onClick={() => onChange(lines.filter((x) => x.k !== l.k))} aria-label={t("common.delete")}><Trash2 /></Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" className="justify-self-start" onClick={() => onChange([...lines, newLine()])}><Plus />{t("inventory.addLine")}</Button>
    </div>
  );
}
