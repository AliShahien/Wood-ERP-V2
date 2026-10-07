import Link from "next/link";
import { Plus } from "@/components/ui/material-icons";
import { can, quotations } from "@edge/core";
import { formatDate, formatNumber } from "@edge/i18n";
import { Forbidden } from "@/components/forbidden";
import { ListToolbar } from "@/components/list-toolbar";
import { Pagination } from "@/components/pagination";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, Num, PageHeader, Table, Td, Th, Tr } from "@/components/ui/primitives";
import { getT } from "@/server/i18n";
import { requirePageContext } from "@/server/session";

const STATUSES = ["DRAFT", "SUBMITTED", "APPROVED", "REJECTED", "EXPIRED", "CONVERTED", "CANCELLED"];

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t("quotations.title") };
}

export default async function QuotationsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requirePageContext();
  const { t, locale } = await getT();
  if (!can(ctx.actor, "quotations.view")) return <Forbidden t={t} />;
  const sp = await searchParams;
  const data = await quotations.listQuotations(ctx, { page: sp.page, q: sp.q, status: sp.status || undefined, customerId: sp.customerId || undefined });
  return (
    <>
      <PageHeader title={t("quotations.title")} actions={can(ctx.actor, "quotations.create") ? <Button asChild><Link href="/quotations/new"><Plus />{t("quotations.new")}</Link></Button> : null} />
      <Card>
        <ListToolbar t={t} sp={sp} filters={[{ name: "status", options: STATUSES.map((s) => ({ value: s, label: t(`status.QuotationStatus.${s}`) })) }]} />
        {data.items.length === 0 ? <EmptyState title={t("common.noResults")} /> : (
          <Table>
            <thead><tr className="border-b">
              <Th>{t("common.code")}</Th><Th>{t("quotations.customer")}</Th><Th>{t("fields.showroom")}</Th><Th>{t("quotations.salesperson")}</Th>
              <Th>{t("quotations.date")}</Th><Th>{t("quotations.validUntil")}</Th><Th className="text-end">{t("quotations.total")}</Th><Th>{t("common.status")}</Th>
            </tr></thead>
            <tbody>
              {data.items.map((q) => (
                <Tr key={q.id}>
                  <Td><Link href={`/quotations/${q.id}`} className="num font-medium hover:underline">{q.number}</Link></Td>
                  <Td>{q.customer.name}</Td>
                  <Td>{q.showroom.name}</Td>
                  <Td>{q.salesperson.fullName}</Td>
                  <Td><Num>{formatDate(locale, q.quotationDate)}</Num></Td>
                  <Td><Num>{formatDate(locale, q.validUntil)}</Num></Td>
                  <Td className="text-end"><Num>{formatNumber(locale, Number(q.total))}</Num></Td>
                  <Td><StatusBadge t={t} group="QuotationStatus" value={q.status} /></Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
        <Pagination t={t} page={data.page} pageCount={data.pageCount} total={data.total} searchParams={sp} basePath="/quotations" />
      </Card>
    </>
  );
}
