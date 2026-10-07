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

export default async function SupplierInvoicesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requirePageContext();
  const { t, locale } = await getT();
  if (!can(ctx.actor, "supplier_invoices.view")) return <Forbidden t={t} />;
  const sp = await searchParams;
  const data = await purchasing.listSupplierInvoices(ctx, { page: sp.page, q: sp.q, status: sp.status || undefined, supplierId: sp.supplierId || undefined });
  const f = (v: unknown) => formatNumber(locale, Number(v ?? 0));
  return (
    <>
      <PageHeader title={t("purchasing.supplierInvoices")} actions={can(ctx.actor, "supplier_invoices.create") ? <Button asChild><Link href="/supplier-invoices/new"><Plus />{t("purchasing.newSupplierInvoice")}</Link></Button> : null} />
      <Card>
        <ListToolbar t={t} sp={sp} filters={[{ name: "status", options: ["DRAFT", "POSTED", "PARTIALLY_PAID", "PAID", "CANCELLED"].map((s) => ({ value: s, label: t(`status.InvoiceStatus.${s}`) })) }]} />
        {data.items.length === 0 ? <EmptyState title={t("common.noResults")} /> : (
          <Table>
            <thead><tr className="border-b"><Th>{t("common.code")}</Th><Th>{t("purchasing.supplierInvoiceNo")}</Th><Th>{t("purchasing.supplier")}</Th><Th>{t("invoices.invoiceDate")}</Th><Th>{t("invoices.dueDate")}</Th><Th className="text-end">{t("docs.total")}</Th><Th className="text-end">{t("invoices.remaining")}</Th><Th>{t("common.status")}</Th></tr></thead>
            <tbody>
              {data.items.map((i) => (
                <Tr key={i.id}>
                  <Td><Link href={`/supplier-invoices/${i.id}`} className="num font-medium hover:underline">{i.number}</Link></Td>
                  <Td><Num>{i.supplierInvoiceNo ?? "—"}</Num></Td><Td>{i.supplier.name}</Td>
                  <Td><Num>{formatDate(locale, i.invoiceDate)}</Num></Td><Td><Num>{i.dueDate ? formatDate(locale, i.dueDate) : "—"}</Num></Td>
                  <Td className="text-end"><Num>{f(i.total)}</Num></Td><Td className="text-end"><Num>{f(Number(i.total) - Number(i.paidAmount))}</Num></Td>
                  <Td><StatusBadge t={t} group="InvoiceStatus" value={i.status} /></Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
        <Pagination t={t} page={data.page} pageCount={data.pageCount} total={data.total} searchParams={sp} basePath="/supplier-invoices" />
      </Card>
    </>
  );
}
