import { can, inventory, warehouses } from "@edge/core";
import { Forbidden } from "@/components/forbidden";
import { ListToolbar } from "@/components/list-toolbar";
import { MovementsTable } from "@/components/movements-table";
import { Pagination } from "@/components/pagination";
import { Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { getT } from "@/server/i18n";
import { requirePageContext } from "@/server/session";

const TYPES = ["OPENING_BALANCE", "PURCHASE_RECEIPT", "MATERIAL_ISSUE", "PRODUCTION_RETURN", "TRANSFER_OUT", "TRANSFER_IN", "ADJUSTMENT_IN", "ADJUSTMENT_OUT", "REVERSAL"];

export default async function MovementsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requirePageContext();
  const { t, locale } = await getT();
  if (!can(ctx.actor, "inventory.view")) return <Forbidden t={t} />;
  const sp = await searchParams;
  const [data, whs] = await Promise.all([
    inventory.stockMovements(ctx, { page: sp.page, q: sp.q, warehouseId: sp.warehouseId || undefined, type: sp.type || undefined, materialId: sp.materialId || undefined, pageSize: 50 }),
    warehouses.listWarehouses(ctx, { pageSize: 100 }).then((r) => r.items).catch(() => []),
  ]);
  return (
    <>
      <PageHeader title={t("inventory.movements")} />
      <Card>
        <ListToolbar t={t} sp={sp} filters={[{ name: "warehouseId", options: whs.map((w) => ({ value: w.id, label: w.name })) }, { name: "type", options: TYPES.map((x) => ({ value: x, label: t(`status.InventoryTxType.${x}`) })) }]} />
        {data.items.length === 0 ? <EmptyState title={t("common.noResults")} /> : <MovementsTable t={t} locale={locale} rows={data.items} />}
        <Pagination t={t} page={data.page} pageCount={data.pageCount} total={data.total} searchParams={sp} basePath="/stock/movements" />
      </Card>
    </>
  );
}
