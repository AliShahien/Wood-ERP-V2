import Link from "next/link";
import { Plus } from "@/components/ui/material-icons";
import { can, inventory, warehouses } from "@edge/core";
import { formatDate } from "@edge/i18n";
import { Forbidden } from "@/components/forbidden";
import { Pagination } from "@/components/pagination";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, Num, PageHeader, Table, Td, Th, Tr } from "@/components/ui/primitives";
import { getT } from "@/server/i18n";
import { requirePageContext } from "@/server/session";
import { StockDocForm } from "../stock-doc-form";

export default async function TransfersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requirePageContext();
  const { t, locale } = await getT();
  if (!can(ctx.actor, "inventory.view")) return <Forbidden t={t} />;
  const sp = await searchParams;
  const creating = sp.new === "1" && can(ctx.actor, "inventory.transfer");
  const [data, whs] = await Promise.all([
    inventory.listTransfers(ctx, { page: sp.page, q: sp.q }),
    creating ? warehouses.listWarehouses(ctx, { pageSize: 100, status: "ACTIVE" }).then((r) => r.items) : Promise.resolve([]),
  ]);
  return (
    <>
      <PageHeader title={t("inventory.transfers")} actions={can(ctx.actor, "inventory.transfer") && !creating ? <Button asChild><Link href="/stock/transfers?new=1"><Plus />{t("inventory.newTransfer")}</Link></Button> : null} />
      {creating ? <div className="mb-4"><StockDocForm kind="transfer" warehouses={whs.map((w) => ({ id: w.id, name: w.name }))} /></div> : null}
      <Card>
        {data.items.length === 0 ? <EmptyState title={t("common.noResults")} /> : (
          <Table>
            <thead><tr className="border-b"><Th>{t("common.code")}</Th><Th>{t("inventory.from")}</Th><Th>{t("inventory.to")}</Th><Th>{t("materialIssues.lines")}</Th><Th>{t("common.createdAt")}</Th><Th>{t("common.status")}</Th></tr></thead>
            <tbody>
              {data.items.map((x) => (
                <Tr key={x.id}>
                  <Td><Link href={`/stock/transfers/${x.id}`} className="num font-medium hover:underline">{x.number}</Link></Td>
                  <Td>{x.fromWarehouse.name}</Td><Td>{x.toWarehouse.name}</Td><Td><Num>{x._count.items}</Num></Td>
                  <Td><Num>{formatDate(locale, x.transferDate)}</Num></Td>
                  <Td><StatusBadge t={t} group="DocStatus" value={x.status} /></Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
        <Pagination t={t} page={data.page} pageCount={data.pageCount} total={data.total} searchParams={sp} basePath="/stock/transfers" />
      </Card>
    </>
  );
}
