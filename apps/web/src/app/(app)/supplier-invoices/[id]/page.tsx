import Link from "next/link";
import { notFound } from "next/navigation";
import { can, purchasing } from "@edge/core";
import { formatDate, formatNumber } from "@edge/i18n";
import { ActionButton } from "@/components/action-button";
import { Forbidden } from "@/components/forbidden";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, Num, PageHeader, Table, Td, Th, Tr } from "@/components/ui/primitives";
import { getT } from "@/server/i18n";
import { requirePageContext } from "@/server/session";

export default async function SupplierInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePageContext();
  const { t, locale } = await getT();
  if (!can(ctx.actor, "supplier_invoices.view")) return <Forbidden t={t} />;
  const { id } = await params;
  const inv = await purchasing.getSupplierInvoice(ctx, id).catch(() => null);
  if (!inv) notFound();
  const a = ctx.actor;
  const f = (v: unknown) => formatNumber(locale, Number(v ?? 0));
  const open = inv.status === "POSTED" || inv.status === "PARTIALLY_PAID";
  return (
    <>
      <PageHeader
        title={`${t("purchasing.supplierInvoices")} ${inv.number}`}
        description={<span className="flex flex-wrap items-center gap-2"><StatusBadge t={t} group="InvoiceStatus" value={inv.status} /><Link href={`/suppliers/${inv.supplier.id}`} className="hover:underline">{inv.supplier.name}</Link>{inv.supplierInvoiceNo ? <Num>#{inv.supplierInvoiceNo}</Num> : null}{inv.purchaseOrder ? <Link href={`/purchase-orders/${inv.purchaseOrder.id}`} className="num hover:underline">{inv.purchaseOrder.number}</Link> : null}</span>}
        actions={
          <>
            {inv.status === "DRAFT" && can(a, "supplier_invoices.post") ? <ActionButton endpoint={`/supplier-invoices/${inv.id}/post`} label="purchasing.post" variant="default" /> : null}
            {open && can(a, "supplier_payments.create") ? <Button asChild variant="outline"><Link href={`/supplier-payments/new?supplierId=${inv.supplier.id}&invoiceId=${inv.id}`}>{t("purchasing.pay")}</Link></Button> : null}
            {inv.status !== "CANCELLED" && Number(inv.paidAmount) === 0 && can(a, "supplier_invoices.cancel") ? <ActionButton endpoint={`/supplier-invoices/${inv.id}/cancel`} label="purchasing.cancel" variant="ghost" prompt="quotations.reasonPrompt" /> : null}
          </>
        }
      />
      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <Card>
          <Table>
            <thead><tr className="border-b"><Th>#</Th><Th>{t("purchasing.description")}</Th><Th className="text-end">{t("docs.qty")}</Th><Th className="text-end">{t("purchasing.unitPrice")}</Th><Th className="text-end">{t("docs.discount")}</Th><Th className="text-end">{t("docs.lineTotal")}</Th></tr></thead>
            <tbody>{inv.items.map((i) => <Tr key={i.id}><Td><Num>{i.lineNo}</Num></Td><Td>{i.description}</Td><Td className="text-end"><Num>{Number(i.quantity)}</Num></Td><Td className="text-end"><Num>{f(i.unitPrice)}</Num></Td><Td className="text-end"><Num>{f(i.discount)}</Num></Td><Td className="text-end"><Num>{f(i.lineTotal)}</Num></Td></Tr>)}</tbody>
          </Table>
        </Card>
        <div className="grid content-start gap-4">
          <Card><CardContent className="pt-5">
            <dl className="grid grid-cols-2 gap-y-1.5 text-sm">
              <dt className="text-muted-foreground">{t("docs.subtotal")}</dt><dd className="num text-end">{f(inv.subtotal)}</dd>
              {inv.taxEnabled ? <><dt className="text-muted-foreground">{t("docs.tax")}</dt><dd className="num text-end">{f(inv.taxTotal)}</dd></> : null}
              <dt className="font-semibold">{t("docs.total")}</dt><dd className="num text-end font-semibold">{f(inv.total)}</dd>
              <dt className="text-muted-foreground">{t("invoices.paid")}</dt><dd className="num text-end">{f(inv.paidAmount)}</dd>
              <dt className="font-semibold">{t("invoices.remaining")}</dt><dd className="num text-end font-semibold">{f(Number(inv.total) - Number(inv.paidAmount))}</dd>
              <dt className="text-muted-foreground">{t("invoices.dueDate")}</dt><dd className="num text-end">{inv.dueDate ? formatDate(locale, inv.dueDate) : "—"}</dd>
            </dl>
          </CardContent></Card>
          <Card>
            <CardHeader><CardTitle>{t("purchasing.supplierPayments")}</CardTitle></CardHeader>
            <CardContent className="grid gap-1 text-sm">
              {inv.payments.length === 0 ? <p className="text-muted-foreground">{t("common.noResults")}</p> : inv.payments.map((p) => (
                <Link key={p.id} href={`/supplier-payments/${p.id}`} className={`flex justify-between hover:underline ${p.status === "REVERSED" ? "line-through opacity-60" : ""}`}><Num>{p.number}</Num><Num>{formatDate(locale, p.paymentDate)}</Num><Num>{f(p.amount)}</Num></Link>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
