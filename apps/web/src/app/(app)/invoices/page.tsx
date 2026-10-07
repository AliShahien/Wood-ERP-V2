import Link from "next/link";
import { can, receivables } from "@edge/core";
import { formatDate, formatNumber } from "@edge/i18n";
import { Forbidden } from "@/components/forbidden";
import { ListToolbar } from "@/components/list-toolbar";
import { Pagination } from "@/components/pagination";
import { StatusBadge } from "@/components/status-badge";
import { Card, Checkbox, EmptyState, Num, PageHeader, Table, Td, Th, Tr } from "@/components/ui/primitives";
import { getT } from "@/server/i18n";
import { requirePageContext } from "@/server/session";

const STATUSES = ["DRAFT", "POSTED", "PARTIALLY_PAID", "PAID", "CANCELLED"];

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t("invoices.title") };
}

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requirePageContext();
  const { t, locale } = await getT();
  if (!can(ctx.actor, "invoices.view")) return <Forbidden t={t} />;
  const sp = await searchParams;
  const data = await receivables.listInvoices(ctx, { page: sp.page, q: sp.q, status: sp.status || undefined, overdue: sp.overdue === "1" ? "1" : undefined });
  const f = (v: unknown) => formatNumber(locale, Number(v ?? 0));
  return (
    <>
      <PageHeader title={t("invoices.title")} />
      <Card>
        <ListToolbar t={t} sp={sp} filters={[{ name: "status", options: STATUSES.map((s) => ({ value: s, label: t(`status.InvoiceStatus.${s}`) })) }]}>
          <label className="flex items-center gap-2 px-2 text-sm"><Checkbox name="overdue" value="1" defaultChecked={sp.overdue === "1"} />{t("invoices.overdue")}</label>
        </ListToolbar>
        {data.items.length === 0 ? <EmptyState title={t("common.noResults")} /> : (
          <Table>
            <thead><tr className="border-b">
              <Th>{t("common.code")}</Th><Th>{t("quotations.customer")}</Th><Th>{t("docs.salesOrderRef")}</Th><Th>{t("invoices.invoiceDate")}</Th><Th>{t("invoices.dueDate")}</Th>
              <Th className="text-end">{t("quotations.total")}</Th><Th className="text-end">{t("invoices.remaining")}</Th><Th>{t("common.status")}</Th>
            </tr></thead>
            <tbody>
              {data.items.map((i) => (
                <Tr key={i.id}>
                  <Td><Link href={`/invoices/${i.id}`} className="num font-medium hover:underline">{i.number}</Link></Td>
                  <Td>{i.customer.name}</Td>
                  <Td><Num className="text-muted-foreground">{i.salesOrder?.number ?? "—"}</Num></Td>
                  <Td><Num>{formatDate(locale, i.invoiceDate)}</Num></Td>
                  <Td><Num>{i.dueDate ? formatDate(locale, i.dueDate) : "—"}</Num></Td>
                  <Td className="text-end"><Num>{f(i.total)}</Num></Td>
                  <Td className="text-end"><Num>{f(Number(i.total) - Number(i.paidAmount))}</Num></Td>
                  <Td><StatusBadge t={t} group="InvoiceStatus" value={i.status} /></Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
        <Pagination t={t} page={data.page} pageCount={data.pageCount} total={data.total} searchParams={sp} basePath="/invoices" />
      </Card>
    </>
  );
}
