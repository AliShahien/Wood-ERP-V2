import Link from "next/link";
import { can, deliveries } from "@edge/core";
import { formatDate } from "@edge/i18n";
import { Forbidden } from "@/components/forbidden";
import { ListToolbar } from "@/components/list-toolbar";
import { Pagination } from "@/components/pagination";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, Num, PageHeader, Table, Td, Th, Tr } from "@/components/ui/primitives";
import { getT } from "@/server/i18n";
import { requirePageContext } from "@/server/session";

const STATUSES = ["PENDING", "SCHEDULED", "DELIVERED", "PARTIALLY_DELIVERED", "CANCELLED"];

export default async function DeliveriesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requirePageContext();
  const { t, locale } = await getT();
  if (!can(ctx.actor, "deliveries.view")) return <Forbidden t={t} />;
  const sp = await searchParams;
  const data = await deliveries.listDeliveries(ctx, { page: sp.page, q: sp.q, status: sp.status || undefined, date: sp.date || undefined });
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return (
    <>
      <PageHeader title={t("deliveries.title")} actions={<Button asChild variant="outline"><Link href={`/deliveries?date=${today}`}>{t("deliveries.today")}</Link></Button>} />
      <Card>
        <ListToolbar t={t} sp={sp} filters={[{ name: "status", options: STATUSES.map((s) => ({ value: s, label: t(`status.DeliveryStatus.${s}`) })) }]} />
        {data.items.length === 0 ? <EmptyState title={t("common.noResults")} /> : (
          <Table>
            <thead><tr className="border-b"><Th>{t("common.code")}</Th><Th>{t("quotations.customer")}</Th><Th>{t("fields.phone")}</Th><Th>{t("docs.salesOrderRef")}</Th><Th>{t("deliveries.scheduledDate")}</Th><Th>{t("deliveries.installation")}</Th><Th>{t("common.status")}</Th></tr></thead>
            <tbody>
              {data.items.map((d) => (
                <Tr key={d.id}>
                  <Td><Link href={`/deliveries/${d.id}`} className="num font-medium hover:underline">{d.number}</Link></Td>
                  <Td>{d.customer.name}</Td><Td><Num>{d.customer.phone ?? "—"}</Num></Td>
                  <Td><Link href={`/sales-orders/${d.salesOrder.id}`} className="num hover:underline">{d.salesOrder.number}</Link></Td>
                  <Td><Num>{d.scheduledDate ? formatDate(locale, d.scheduledDate, true) : "—"}</Num></Td>
                  <Td><StatusBadge t={t} group="InstallationStatus" value={d.installationStatus} /></Td>
                  <Td><StatusBadge t={t} group="DeliveryStatus" value={d.status} /></Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
        <Pagination t={t} page={data.page} pageCount={data.pageCount} total={data.total} searchParams={sp} basePath="/deliveries" />
      </Card>
    </>
  );
}
