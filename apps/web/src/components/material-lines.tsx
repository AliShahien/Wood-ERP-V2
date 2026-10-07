"use client";

import { Plus, Trash2 } from "@/components/ui/material-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/primitives";
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
    <div className="grid gap-2">
      {lines.map((l) => (
        <div key={l.k} className={`grid gap-2 ${withCost ? "sm:grid-cols-[1fr_140px_140px_auto]" : "sm:grid-cols-[1fr_140px_auto]"}`}>
          <SearchPicker endpoint="/materials?status=ACTIVE" map={(r) => ({ id: String(r.id), label: String(r.name), sub: `${r.code} · ${(r.unit as { name: string })?.name ?? ""}` })} value={l.material} onChange={(v) => patch(l.k, { material: v })} placeholder={t("docs.material")} />
          <Input type="number" dir="ltr" step="any" min={allowNegative ? undefined : 0} placeholder={qtyLabel ?? t("docs.qty")} value={l.quantity} onChange={(e) => patch(l.k, { quantity: e.target.value })} />
          {withCost ? <Input type="number" dir="ltr" step="any" min={0} placeholder={costLabel ?? t("inventory.unitCost")} value={l.unitCost} onChange={(e) => patch(l.k, { unitCost: e.target.value })} /> : null}
          <Button type="button" size="icon" variant="ghost" onClick={() => onChange(lines.filter((x) => x.k !== l.k))} aria-label={t("common.delete")}><Trash2 /></Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" className="justify-self-start" onClick={() => onChange([...lines, newLine()])}><Plus />{t("inventory.addLine")}</Button>
    </div>
  );
}
