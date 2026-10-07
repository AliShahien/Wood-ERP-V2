import Link from "next/link";
import { notFound } from "next/navigation";
import { can, lookups, materials, plain } from "@edge/core";
import { formatNumber } from "@edge/i18n";
import { ActionButton } from "@/components/action-button";
import { EntityForm } from "@/components/entity-form";
import { Forbidden } from "@/components/forbidden";
import { Card, CardContent, CardHeader, CardTitle, Num, PageHeader, Table, Td, Th, Tr } from "@/components/ui/primitives";
import { getT } from "@/server/i18n";
import { requirePageContext } from "@/server/session";
import { Button } from "@/components/ui/button";
import { materialFields } from "../fields";
import { MaterialMovements } from "./movements";

export default async function MaterialPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePageContext();
  const { t, locale } = await getT();
  if (!can(ctx.actor, "materials.view")) return <Forbidden t={t} />;
  const { id } = await params;
  const m = await materials.getMaterial(ctx, id).catch(() => null);
  if (!m) notFound();
  const canEdit = can(ctx.actor, "materials.edit");
  const [cats, units, sups] = await Promise.all([
    materials.listMaterialCategories(ctx),
    materials.listUnits(ctx),
    canEdit ? lookups.supplierOptions(ctx) : Promise.resolve(m.defaultSupplier ? [m.defaultSupplier] : []),
  ]);
  const cost = m as unknown as { averageCost?: string; lastPurchaseCost?: string | null };
  return (
    <>
      <PageHeader title={m.name} description={<Num>{m.code}</Num>} actions={<>
        {can(ctx.actor, "goods_receipts.view") ? <Button asChild variant="outline"><Link href="/goods-receipts">{t("purchasing.receipts")}</Link></Button> : null}
        {can(ctx.actor, "inventory.adjust") ? <Button asChild variant="outline"><Link href="/stock/adjustments?new=1">{t("nav.adjustments")}</Link></Button> : null}
        {can(ctx.actor, "materials.delete") ? <ActionButton endpoint={`/materials/${m.id}`} method="DELETE" label="common.delete" variant="destructive" redirectTo="/materials" /> : null}
      </>} />
      <p className="mb-4 rounded-2xl bg-secondary px-5 py-3 text-sm text-secondary-foreground">{t("workflow.materialsInfo")}</p>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">{t("materials.onHand")}</p><p className="num mt-1 text-lg font-semibold">{formatNumber(locale, m.onHand)} <span className="text-sm font-normal text-muted-foreground">{m.unit.name}</span></p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">{t("materials.reorderLevel")}</p><p className="num mt-1 text-lg font-semibold">{formatNumber(locale, Number(m.reorderLevel))}</p></CardContent></Card>
        {cost.averageCost !== undefined ? (
          <>
            <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">{t("materials.averageCost")}</p><p className="num mt-1 text-lg font-semibold">{formatNumber(locale, Number(cost.averageCost), 4)}</p></CardContent></Card>
            <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">{t("materials.lastPurchaseCost")}</p><p className="num mt-1 text-lg font-semibold">{cost.lastPurchaseCost ? formatNumber(locale, Number(cost.lastPurchaseCost), 4) : "—"}</p></CardContent></Card>
          </>
        ) : null}
      </div>
      <div className="grid gap-4">
        <Card>
          <CardHeader><CardTitle>{t("materials.stockByWarehouse")}</CardTitle></CardHeader>
          <Table>
            <thead><tr className="border-b"><Th>{t("nav.warehouses")}</Th><Th className="text-end">{t("materials.onHand")}</Th></tr></thead>
            <tbody>
              {m.balances.map((b) => (
                <Tr key={b.warehouseId}><Td>{b.warehouse.name}</Td><Td className="text-end"><Num>{formatNumber(locale, Number(b.quantity))}</Num></Td></Tr>
              ))}
            </tbody>
          </Table>
          {m.balances.length === 0 ? <CardContent className="text-sm text-muted-foreground">{t("common.noResults")}</CardContent> : null}
        </Card>
        <MaterialMovements materialId={m.id} />
        <EntityForm fields={materialFields(cats, units, sups)} endpoint={`/materials/${m.id}`} method="PATCH" isEdit readOnly={!canEdit} initial={plain(m) as unknown as Record<string, unknown>} />
      </div>
    </>
  );
}
