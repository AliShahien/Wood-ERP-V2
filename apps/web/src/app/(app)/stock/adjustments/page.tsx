import Link from "next/link";
import { Plus } from "@/components/ui/material-icons";
import { can, inventory, warehouses } from "@edge/core";
import { formatDate } from "@edge/i18n";
import { Forbidden } from "@/components/forbidden";
import { Pagination } from "@/components/pagination";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Badge, Card, EmptyState, Num, PageHeader, Table, Td, Th, Tr } from "@/components/ui/primitives";
import { getT } from "@/server/i18n";
import { requirePageContext } from "@/server/session";
import { StockDocForm } from "../stock-doc-form";

export default async function AdjustmentsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requirePageContext();
  const { t, locale } = await getT();
  if (!can(ctx.actor, "inventory.view")) return <Forbidden t={t} />;
  const sp = await searchParams;
  const creating = sp.new === "1" && can(ctx.actor, "inventory.adjust");
  const [data, whs] = await Promise.all([
    inventory.listAdjustments(ctx, { page: sp.page, q: sp.q }),
    creating ? warehouses.listWarehouses(ctx, { pageSize: 100, status: "ACTIVE" }).then((r) => r.items) : Promise.resolve([]),
  ]);
  return (
    <>
      <PageHeader title={t("inventory.adjustments")} actions={can(ctx.actor, "inventory.adjust") && !creating ? <Button asChild><Link href="/stock/adjustments?new=1"><Plus />{t("inventory.newAdjustment")}</Link></Button> : null} />
      {creating ? <div className="mb-4"><StockDocForm kind="adjustment" warehouses={whs.filter((w) => !ctx.actor.warehouseIds.length || ctx.actor.isSuperAdmin || ctx.actor.warehouseIds.includes(w.id)).map((w) => ({ id: w.id, name: w.name }))} /></div> : null}
      <Card>
        {data.items.length === 0 ? <EmptyState title={t("common.noResults")} /> : (
          <Table>
            <thead><tr className="border-b"><Th>{t("common.code")}</Th><Th>{t("nav.warehouses")}</Th><Th>{t("inventory.reason")}</Th><Th>{t("materialIssues.lines")}</Th><Th>{t("common.createdAt")}</Th><Th>{t("common.status")}</Th></tr></thead>
            <tbody>
              {data.items.map((a) => (
                <Tr key={a.id}>
                  <Td><Link href={`/stock/adjustments/${a.id}`} className="num font-medium hover:underline">{a.number}</Link>{a.isOpening ? <Badge tone="info" className="ms-2">{t("inventory.opening")}</Badge> : null}</Td>
                  <Td>{a.warehouse.name}</Td><Td>{a.reason}</Td><Td><Num>{a._count.items}</Num></Td>
                  <Td><Num>{formatDate(locale, a.adjustmentDate)}</Num></Td>
                  <Td><StatusBadge t={t} group="DocStatus" value={a.status} /></Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
        <Pagination t={t} page={data.page} pageCount={data.pageCount} total={data.total} searchParams={sp} basePath="/stock/adjustments" />
      </Card>
    </>
  );
}
