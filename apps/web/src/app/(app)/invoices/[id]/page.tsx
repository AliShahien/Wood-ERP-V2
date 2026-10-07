import Link from "next/link";
import { notFound } from "next/navigation";
import { can, receivables } from "@edge/core";
import { formatDate, formatNumber } from "@edge/i18n";
import { ActionButton } from "@/components/action-button";
import { DocLinks } from "@/components/doc-links";
import { Forbidden } from "@/components/forbidden";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, Num, PageHeader, Table, Td, Th, Tr } from "@/components/ui/primitives";
import { getT } from "@/server/i18n";
import { requirePageContext } from "@/server/session";

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePageContext();
  const { t, locale } = await getT();
  if (!can(ctx.actor, "invoices.view")) return <Forbidden t={t} />;
  const { id } = await params;
  const inv = await receivables.getInvoice(ctx, id).catch(() => null);
  if (!inv) notFound();
  const f = (v: unknown) => formatNumber(locale, Number(v ?? 0));
  const a = ctx.actor;
  const open = inv.status === "POSTED" || inv.status === "PARTIALLY_PAID";
  return (
    <>
      <PageHeader
        title={`${t("docs.invoice")} ${inv.number}`}
        description={<span className="flex flex-wrap items-center gap-2"><StatusBadge t={t} group="InvoiceStatus" value={inv.status} /><Link href={`/customers/${inv.customer.id}`} className="hover:underline">{inv.customer.name}</Link>{inv.salesOrder ? <Link href={`/sales-orders/${inv.salesOrder.id}`} className="num text-muted-foreground hover:underline">{inv.salesOrder.number}</Link> : null}</span>}
        actions={
          <>
            <DocLinks t={t} type="invoice" id={inv.id} />
            {inv.status === "DRAFT" && can(a, "invoices.post") ? <ActionButton endpoint={`/invoices/${inv.id}/post`} label="invoices.post" variant="default" /> : null}
            {open && can(a, "payments.create") ? <Button asChild variant="outline"><Link href={`/payments/new?customerId=${inv.customer.id}${inv.salesOrder ? `&salesOrderId=${inv.salesOrder.id}` : ""}`}>{t("salesOrders.recordPayment")}</Link></Button> : null}
            {inv.status !== "CANCELLED" && can(a, "invoices.cancel") ? <ActionButton endpoint={`/invoices/${inv.id}/cancel`} label="invoices.cancel" variant="ghost" prompt="quotations.reasonPrompt" /> : null}
          </>
        }
      />
      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <Card>
          <Table>
            <thead><tr className="border-b"><Th>#</Th><Th>{t("docs.item")}</Th><Th className="text-end">{t("docs.qty")}</Th><Th className="text-end">{t("docs.unitPrice")}</Th><Th className="text-end">{t("docs.discount")}</Th><Th className="text-end">{t("docs.lineTotal")}</Th></tr></thead>
            <tbody>
              {inv.items.map((i) => (
                <Tr key={i.id}><Td><Num>{i.lineNo}</Num></Td><Td>{i.description}</Td><Td className="text-end"><Num>{Number(i.quantity)}</Num></Td><Td className="text-end"><Num>{f(i.unitPrice)}</Num></Td><Td className="text-end"><Num>{f(i.discount)}</Num></Td><Td className="text-end"><Num>{f(i.lineTotal)}</Num></Td></Tr>
              ))}
            </tbody>
          </Table>
        </Card>
        <div className="grid content-start gap-4">
          <Card>
            <CardContent className="pt-5">
              <dl className="grid grid-cols-2 gap-y-1.5 text-sm">
                <dt className="text-muted-foreground">{t("docs.subtotal")}</dt><dd className="num text-end">{f(inv.subtotal)}</dd>
                <dt className="text-muted-foreground">{t("docs.discount")}</dt><dd className="num text-end">{f(inv.discountTotal)}</dd>
                <dt className="text-muted-foreground">{t("docs.installation")}</dt><dd className="num text-end">{f(inv.installationCharge)}</dd>
                <dt className="text-muted-foreground">{t("docs.transportation")}</dt><dd className="num text-end">{f(inv.transportationCharge)}</dd>
                {inv.taxEnabled ? <><dt className="text-muted-foreground">{t("docs.tax")}</dt><dd className="num text-end">{f(inv.taxTotal)}</dd></> : null}
                <dt className="font-semibold">{t("docs.total")}</dt><dd className="num text-end font-semibold">{f(inv.total)} {inv.currency}</dd>
                <dt className="text-muted-foreground">{t("invoices.paid")}</dt><dd className="num text-end">{f(inv.paidAmount)}</dd>
                <dt className="font-semibold">{t("invoices.remaining")}</dt><dd className="num text-end font-semibold">{f(Number(inv.total) - Number(inv.paidAmount))}</dd>
              </dl>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>{t("invoices.allocations")}</CardTitle></CardHeader>
            <CardContent className="grid gap-1 text-sm">
              {inv.allocations.length === 0 ? <p className="text-muted-foreground">{t("common.noResults")}</p> : inv.allocations.map((al) => (
                <Link key={al.id} href={`/payments/${al.payment.id}`} className="flex justify-between hover:underline"><Num>{al.payment.number}</Num><Num>{formatDate(locale, al.payment.paymentDate)}</Num><Num>{f(al.amount)}</Num></Link>
              ))}
            </CardContent>
          </Card>
          <Card><CardContent className="grid gap-1 pt-5 text-sm">
            <p><span className="text-muted-foreground">{t("invoices.invoiceDate")}:</span> <Num>{formatDate(locale, inv.invoiceDate)}</Num></p>
            <p><span className="text-muted-foreground">{t("invoices.dueDate")}:</span> <Num>{inv.dueDate ? formatDate(locale, inv.dueDate) : "—"}</Num></p>
            {inv.cancelReason ? <p className="text-destructive">{inv.cancelReason}</p> : null}
          </CardContent></Card>
        </div>
      </div>
    </>
  );
}
