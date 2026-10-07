"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox, Input } from "@/components/ui/primitives";
import { useI18n } from "@/components/i18n-provider";
import { api, ApiError } from "@/lib/api-client";

type Opt = { id: string; type: string; name: string; priceMethod: string; priceAdjustment: string };
type Sel = { optionId: string; priceOverride: string | null; isDefault: boolean };

export function OptionsEditor({ productId, all, selected }: { productId: string; all: Opt[]; selected: Sel[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const [sel, setSel] = useState<Map<string, Sel>>(new Map(selected.map((s) => [s.optionId, s])));
  const [busy, setBusy] = useState(false);

  const groups = [...new Set(all.map((o) => o.type))];
  const toggle = (id: string) => setSel((m) => {
    const n = new Map(m);
    if (n.has(id)) n.delete(id);
    else n.set(id, { optionId: id, priceOverride: null, isDefault: false });
    return n;
  });
  const patch = (id: string, p: Partial<Sel>) => setSel((m) => new Map(m).set(id, { ...m.get(id)!, ...p }));

  async function save() {
    setBusy(true);
    try {
      await api(`/products/${productId}/options`, {
        method: "PUT",
        body: { options: [...sel.values()].map((s) => ({ optionId: s.optionId, priceOverride: s.priceOverride === null || s.priceOverride === "" ? null : Number(s.priceOverride), isDefault: s.isDefault })) },
      });
      toast.success(t("common.saved"));
      router.refresh();
    } catch (err) {
      toast.error(t(err instanceof ApiError ? err.body.messageKey : "errors.internal"));
    } finally {
      setBusy(false);
    }
  }

  if (all.length === 0) return <p className="text-sm text-muted-foreground">{t("common.noResults")}</p>;

  return (
    <div className="grid gap-4">
      {groups.map((g) => (
        <div key={g}>
          <p className="mb-2 text-sm font-medium">{t(`status.OptionType.${g}`)}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {all.filter((o) => o.type === g).map((o) => {
              const s = sel.get(o.id);
              return (
                <div key={o.id} className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm">
                  <label className="flex min-w-0 flex-1 items-center gap-2">
                    <Checkbox checked={Boolean(s)} onChange={() => toggle(o.id)} />
                    <span className="truncate">{o.name}</span>
                    <span className="num text-xs text-muted-foreground">({o.priceAdjustment}{o.priceMethod === "PERCENT" ? "%" : ""})</span>
                  </label>
                  {s ? (
                    <>
                      <Input
                        className="h-8 w-28"
                        type="number"
                        step="0.01"
                        dir="ltr"
                        placeholder={t("products.priceOverride")}
                        value={s.priceOverride ?? ""}
                        onChange={(e) => patch(o.id, { priceOverride: e.target.value })}
                      />
                      <label className="flex items-center gap-1 text-xs"><Checkbox checked={s.isDefault} onChange={(e) => patch(o.id, { isDefault: e.target.checked })} />{t("fields.isDefault")}</label>
                    </>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ))}
      <div><Button onClick={save} disabled={busy}>{t("products.saveOptions")}</Button></div>
    </div>
  );
}
