import Link from "next/link";
import { can, inventory, materials, warehouses } from "@edge/core";
import { formatNumber } from "@edge/i18n";
import { Forbidden } from "@/components/forbidden";
import { ListToolbar } from "@/components/list-toolbar";
import { Pagination } from "@/components/pagination";
import { Card, CardContent, Checkbox, EmptyState, Num, PageHeader, Table, Td, Th, Tr } from "@/components/ui/primitives";
import { getT } from "@/server/i18n";
import { requirePageContext } from "@/server/session";
import { Button } from "@/components/ui/button";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t("inventory.stock") };
}

export default async function StockPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requirePageContext();
  const { t, locale } = await getT();
  if (!can(ctx.actor, "inventory.view")) return <Forbidden t={t} />;
  const sp = await searchParams;
  const showCost = can(ctx.actor, "costing.view");
  const [data, whs, cats, value] = await Promise.all([
    inventory.stockBalances(ctx, { page: sp.page, q: sp.q, warehouseId: sp.warehouseId || undefined, categoryId: sp.categoryId || undefined, nonZero: sp.nonZero === "1" ? "1" : undefined, pageSize: 50 }),
    warehouses.listWarehouses(ctx, { pageSize: 100 }).then((r) => r.items).catch(() => []),
    materials.listMaterialCategories(ctx).catch(() => []),
    showCost ? inventory.stockValue(ctx) : Promise.resolve(null),
  ]);
  return (
    <>
      <PageHeader title={t("inventory.stock")} actions={<>
        {can(ctx.actor, "inventory.adjust") ? <Button asChild variant="outline"><Link href="/stock/adjustments">{t("nav.adjustments")}</Link></Button> : null}
        {can(ctx.actor, "inventory.transfer") ? <Button asChild variant="outline"><Link href="/stock/transfers">{t("nav.transfers")}</Link></Button> : null}
        {can(ctx.actor, "purchases.view") ? <Button asChild variant="outline"><Link href="/purchase-requests">{t("purchasing.requests")}</Link></Button> : null}
      </>} />
      {value !== null ? (
        <Card className="mb-4 w-fit"><CardContent className="pt-4"><p className="text-xs text-muted-foreground">{t("inventory.inventoryValue")}</p><p className="num text-xl font-semibold">{formatNumber(locale, value)}</p></CardContent></Card>
      ) : null}
      <Card>
        <ListToolbar t={t} sp={sp} filters={[{ name: "warehouseId", options: whs.map((w) => ({ value: w.id, label: w.name })) }, { name: "categoryId", options: cats.map((c) => ({ value: c.id, label: c.name })) }]}>
          <label className="flex items-center gap-2 px-2 text-sm"><Checkbox name="nonZero" value="1" defaultChecked={sp.nonZero === "1"} />{t("inventory.nonZero")}</label>
        </ListToolbar>
        {data.items.length === 0 ? <EmptyState title={t("common.noResults")} /> : (
          <Table>
            <thead><tr className="border-b">
              <Th>{t("common.code")}</Th><Th>{t("docs.material")}</Th><Th>{t("nav.warehouses")}</Th><Th className="text-end">{t("materials.onHand")}</Th><Th>{t("fields.unit")}</Th>
              {showCost ? <><Th className="text-end">{t("materials.averageCost")}</Th><Th className="text-end">{t("inventory.value")}</Th></> : null}
            </tr></thead>
            <tbody>
              {data.items.map((b) => (
                <Tr key={`${b.materialId}-${b.warehouseId}`}>
                  <Td><Num className="text-muted-foreground">{b.material.code}</Num></Td>
                  <Td><Link href={`/materials/${b.material.id}`} className="font-medium hover:underline">{b.material.name}</Link></Td>
                  <Td>{b.warehouse.name}</Td>
                  <Td className="text-end"><Num className={Number(b.quantity) <= Number(b.material.reorderLevel) ? "font-semibold text-destructive" : ""}>{formatNumber(locale, Number(b.quantity), 3)}</Num></Td>
                  <Td>{b.material.unit.name}</Td>
                  {showCost ? <><Td className="text-end"><Num>{formatNumber(locale, Number(b.material.averageCost), 4)}</Num></Td><Td className="text-end"><Num>{formatNumber(locale, Number(b.value))}</Num></Td></> : null}
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
        <Pagination t={t} page={data.page} pageCount={data.pageCount} total={data.total} searchParams={sp} basePath="/stock" />
      </Card>
    </>
  );
}
