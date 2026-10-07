import Link from "next/link";
import { Plus } from "@/components/ui/material-icons";
import { can, purchasing } from "@edge/core";
import { formatDate, formatNumber } from "@edge/i18n";
import { Forbidden } from "@/components/forbidden";
import { ListToolbar } from "@/components/list-toolbar";
import { Pagination } from "@/components/pagination";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, Num, PageHeader, Table, Td, Th, Tr } from "@/components/ui/primitives";
import { getT } from "@/server/i18n";
import { requirePageContext } from "@/server/session";

const STATUSES = ["DRAFT", "SUBMITTED", "APPROVED", "PARTIALLY_RECEIVED", "RECEIVED", "CLOSED", "CANCELLED"];

export default async function PurchaseOrdersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requirePageContext();
  const { t, locale } = await getT();
  if (!can(ctx.actor, "purchases.view")) return <Forbidden t={t} />;
  const sp = await searchParams;
  const data = await purchasing.listPurchaseOrders(ctx, { page: sp.page, q: sp.q, status: sp.status || undefined, supplierId: sp.supplierId || undefined });
  return (
    <>
      <PageHeader title={t("purchasing.orders")} actions={can(ctx.actor, "purchases.create") ? <Button asChild><Link href="/purchase-orders/new"><Plus />{t("purchasing.newOrder")}</Link></Button> : null} />
      <Card>
        <ListToolbar t={t} sp={sp} filters={[{ name: "status", options: STATUSES.map((s) => ({ value: s, label: t(`status.PurchaseOrderStatus.${s}`) })) }]} />
        {data.items.length === 0 ? <EmptyState title={t("common.noResults")} /> : (
          <Table>
            <thead><tr className="border-b"><Th>{t("common.code")}</Th><Th>{t("purchasing.supplier")}</Th><Th>{t("purchasing.warehouse")}</Th><Th>{t("purchasing.orderDate")}</Th><Th>{t("purchasing.expectedDate")}</Th><Th className="text-end">{t("docs.total")}</Th><Th>{t("common.status")}</Th></tr></thead>
            <tbody>
              {data.items.map((po) => (
                <Tr key={po.id}>
                  <Td><Link href={`/purchase-orders/${po.id}`} className="num font-medium hover:underline">{po.number}</Link></Td>
                  <Td>{po.supplier.name}</Td><Td>{po.warehouse.name}</Td>
                  <Td><Num>{formatDate(locale, po.orderDate)}</Num></Td>
                  <Td><Num>{po.expectedDate ? formatDate(locale, po.expectedDate) : "—"}</Num></Td>
                  <Td className="text-end"><Num>{formatNumber(locale, Number(po.total))}</Num></Td>
                  <Td><StatusBadge t={t} group="PurchaseOrderStatus" value={po.status} /></Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
        <Pagination t={t} page={data.page} pageCount={data.pageCount} total={data.total} searchParams={sp} basePath="/purchase-orders" />
      </Card>
    </>
  );
}
