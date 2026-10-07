import Link from "next/link";
import { can, salesOrders } from "@edge/core";
import { formatDate, formatNumber } from "@edge/i18n";
import { Forbidden } from "@/components/forbidden";
import { ListToolbar } from "@/components/list-toolbar";
import { Pagination } from "@/components/pagination";
import { StatusBadge } from "@/components/status-badge";
import { Card, EmptyState, Num, PageHeader, Table, Td, Th, Tr } from "@/components/ui/primitives";
import { getT } from "@/server/i18n";
import { requirePageContext } from "@/server/session";

const STATUSES = ["CONFIRMED", "IN_PRODUCTION", "READY", "PARTIALLY_DELIVERED", "DELIVERED", "CLOSED", "CANCELLED"];

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t("salesOrders.title") };
}

export default async function SalesOrdersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requirePageContext();
  const { t, locale } = await getT();
  if (!can(ctx.actor, "sales_orders.view")) return <Forbidden t={t} />;
  const sp = await searchParams;
  const data = await salesOrders.listSalesOrders(ctx, { page: sp.page, q: sp.q, status: sp.status || undefined, customerId: sp.customerId || undefined });
  return (
    <>
      <PageHeader title={t("salesOrders.title")} />
      <Card>
        <ListToolbar t={t} sp={sp} filters={[{ name: "status", options: STATUSES.map((s) => ({ value: s, label: t(`status.SalesOrderStatus.${s}`) })) }]} />
        {data.items.length === 0 ? <EmptyState title={t("common.noResults")} /> : (
          <Table>
            <thead><tr className="border-b">
              <Th>{t("common.code")}</Th><Th>{t("quotations.customer")}</Th><Th>{t("salesOrders.quotation")}</Th><Th>{t("salesOrders.orderDate")}</Th>
              <Th>{t("salesOrders.requiredDate")}</Th><Th className="text-end">{t("quotations.total")}</Th><Th>{t("common.status")}</Th>
            </tr></thead>
            <tbody>
              {data.items.map((so) => (
                <Tr key={so.id}>
                  <Td><Link href={`/sales-orders/${so.id}`} className="num font-medium hover:underline">{so.number}</Link></Td>
                  <Td>{so.customer.name}</Td>
                  <Td><Num className="text-muted-foreground">{so.quotation.number}</Num></Td>
                  <Td><Num>{formatDate(locale, so.orderDate)}</Num></Td>
                  <Td><Num>{so.requiredDate ? formatDate(locale, so.requiredDate) : "—"}</Num></Td>
                  <Td className="text-end"><Num>{formatNumber(locale, Number(so.total))}</Num></Td>
                  <Td><StatusBadge t={t} group="SalesOrderStatus" value={so.status} /></Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
        <Pagination t={t} page={data.page} pageCount={data.pageCount} total={data.total} searchParams={sp} basePath="/sales-orders" />
      </Card>
    </>
  );
}
