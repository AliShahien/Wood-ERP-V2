"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, Checkbox, Field, Input, NativeSelect } from "@/components/ui/primitives";
import { useI18n } from "@/components/i18n-provider";
import { MaterialLines, newLine, type MaterialLine } from "@/components/material-lines";
import { api, ApiError } from "@/lib/api-client";

/** Draft form for stock adjustments (incl. opening balance) and transfers. */
export function StockDocForm({ kind, warehouses }: { kind: "adjustment" | "transfer"; warehouses: { id: string; name: string }[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const [lines, setLines] = useState<MaterialLine[]>([newLine()]);
  const [opening, setOpening] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    const valid = lines.filter((l) => l.material && l.quantity);
    setPending(true);
    try {
      const body = kind === "adjustment"
        ? {
            warehouseId: f.warehouseId, isOpening: opening, reason: f.reason, adjustmentDate: f.date || undefined,
            items: valid.map((l) => ({ materialId: l.material!.id, quantityChange: Number(l.quantity), unitCost: l.unitCost === "" ? null : Number(l.unitCost) })),
          }
        : { fromWarehouseId: f.fromWarehouseId, toWarehouseId: f.toWarehouseId, transferDate: f.date || undefined, items: valid.map((l) => ({ materialId: l.material!.id, quantity: Number(l.quantity) })) };
      const res = await api<{ id: string }>(kind === "adjustment" ? "/stock-adjustments" : "/stock-transfers", { body });
      toast.success(t("common.saved"));
      router.push(`/stock/${kind === "adjustment" ? "adjustments" : "transfers"}/${res.id}`);
    } catch (err) {
      toast.error(t(err instanceof ApiError ? err.body.messageKey : "errors.internal"));
    } finally {
      setPending(false);
    }
  }

  const whSelect = (name: string, label: string) => (
    <Field label={label}>
      <NativeSelect name={name} required>
        {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
      </NativeSelect>
    </Field>
  );

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <Card>
        <CardContent className="grid gap-4 pt-5 sm:grid-cols-3">
          {kind === "adjustment" ? (
            <>
              {whSelect("warehouseId", t("nav.warehouses"))}
              <Field label={t("inventory.reason")}><Input name="reason" required /></Field>
              <label className="flex items-center gap-2 self-end pb-2 text-sm"><Checkbox checked={opening} onChange={(e) => setOpening(e.target.checked)} />{t("inventory.opening")}</label>
            </>
          ) : (
            <>
              {whSelect("fromWarehouseId", t("inventory.from"))}
              {whSelect("toWarehouseId", t("inventory.to"))}
            </>
          )}
          <Field label={t("common.createdAt")}><Input name="date" type="date" dir="ltr" defaultValue={new Date().toISOString().slice(0, 10)} /></Field>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-5">
          <MaterialLines lines={lines} onChange={setLines} withCost={kind === "adjustment"} allowNegative={kind === "adjustment" && !opening} qtyLabel={kind === "adjustment" ? t("inventory.quantityChange") : undefined} />
        </CardContent>
      </Card>
      <div><Button type="submit" disabled={pending}>{t("common.save")}</Button></div>
    </form>
  );
}
