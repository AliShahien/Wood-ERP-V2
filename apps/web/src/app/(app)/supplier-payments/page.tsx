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

export default async function SupplierPaymentsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requirePageContext();
  const { t, locale } = await getT();
  if (!can(ctx.actor, "supplier_payments.view")) return <Forbidden t={t} />;
  const sp = await searchParams;
  const data = await purchasing.listSupplierPayments(ctx, { page: sp.page, q: sp.q, status: sp.status || undefined });
  return (
    <>
      <PageHeader title={t("purchasing.supplierPayments")} actions={can(ctx.actor, "supplier_payments.create") ? <Button asChild><Link href="/supplier-payments/new"><Plus />{t("purchasing.newSupplierPayment")}</Link></Button> : null} />
      <Card>
        <ListToolbar t={t} sp={sp} filters={[{ name: "status", options: ["POSTED", "REVERSED"].map((s) => ({ value: s, label: t(`status.PaymentStatus.${s}`) })) }]} />
        {data.items.length === 0 ? <EmptyState title={t("common.noResults")} /> : (
          <Table>
            <thead><tr className="border-b"><Th>{t("common.code")}</Th><Th>{t("purchasing.supplier")}</Th><Th>{t("purchasing.invoice")}</Th><Th>{t("payments.date")}</Th><Th>{t("payments.method")}</Th><Th>{t("payments.account")}</Th><Th className="text-end">{t("payments.amount")}</Th><Th>{t("common.status")}</Th></tr></thead>
            <tbody>
              {data.items.map((p) => (
                <Tr key={p.id}>
                  <Td><Link href={`/supplier-payments/${p.id}`} className="num font-medium hover:underline">{p.number}</Link></Td>
                  <Td>{p.supplier.name}</Td><Td><Num>{p.invoice?.number ?? "—"}</Num></Td>
                  <Td><Num>{formatDate(locale, p.paymentDate)}</Num></Td><Td>{t(`status.PaymentMethod.${p.method}`)}</Td><Td>{p.cashAccount.name}</Td>
                  <Td className="text-end"><Num>{formatNumber(locale, Number(p.amount))}</Num></Td>
                  <Td><StatusBadge t={t} group="PaymentStatus" value={p.status} /></Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
        <Pagination t={t} page={data.page} pageCount={data.pageCount} total={data.total} searchParams={sp} basePath="/supplier-payments" />
      </Card>
    </>
  );
}
