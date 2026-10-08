"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, Field, Input, NativeSelect } from "@/components/ui/primitives";
import { useI18n } from "@/components/i18n-provider";
import { MaterialLines, newLine, type MaterialLine } from "@/components/material-lines";
import { SearchPicker, type PickItem } from "@/components/search-picker";
import { api, ApiError } from "@/lib/api-client";

/** Goods receipt without a purchase order (unit cost required per line). */
export function DirectReceiptForm({ warehouses }: { warehouses: { id: string; name: string }[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const [supplier, setSupplier] = useState<PickItem | null>(null);
  const [lines, setLines] = useState<MaterialLine[]>([newLine()]);
  const [pending, setPending] = useState(false);
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!supplier) return;
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    setPending(true);
    try {
      const res = await api<{ id: string }>("/goods-receipts", {
        body: {
          supplierId: supplier.id, warehouseId: f.warehouseId, supplierDocNo: f.supplierDocNo || null, receiptDate: f.date || undefined,
          items: lines.filter((l) => l.material && l.quantity).map((l) => ({ materialId: l.material!.id, quantity: Number(l.quantity), unitCost: Number(l.unitCost || 0) })),
        },
      });
      router.push(`/goods-receipts/${res.id}`);
    } catch (err) {
      toast.error(t(err instanceof ApiError ? err.body.messageKey : "errors.internal"));
    } finally {
      setPending(false);
    }
  }
  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <Card>
        <CardContent className="grid gap-5 pt-5 sm:grid-cols-2">
          <Field label={t("purchasing.supplier")}><SearchPicker endpoint="/suppliers?status=ACTIVE" map={(r) => ({ id: String(r.id), label: String(r.name), sub: String(r.code) })} value={supplier} onChange={setSupplier} placeholder={t("common.searchPlaceholder")} /></Field>
          <Field label={t("purchasing.warehouse")}><NativeSelect name="warehouseId" required>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</NativeSelect></Field>
          <Field label={t("purchasing.supplierDocNo")}><Input name="supplierDocNo" dir="ltr" /></Field>
          <Field label={t("common.createdAt")}><Input name="date" type="date" dir="ltr" defaultValue={new Date().toISOString().slice(0, 10)} /></Field>
          <div className="border-t pt-5 sm:col-span-2"><MaterialLines lines={lines} onChange={setLines} withCost /></div>
        </CardContent>
      </Card>
      <div><Button type="submit" disabled={pending || !supplier}>{t("common.save")}</Button></div>
    </form>
  );
}
