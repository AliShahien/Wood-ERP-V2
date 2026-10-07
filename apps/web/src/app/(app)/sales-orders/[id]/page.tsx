import Link from "next/link";
import { notFound } from "next/navigation";
import { can, salesOrders } from "@edge/core";
import { formatDate, formatNumber } from "@edge/i18n";
import { ActionButton } from "@/components/action-button";
import { AttachmentsPanel } from "@/components/attachments-panel";
import { DocLinks } from "@/components/doc-links";
import { Forbidden } from "@/components/forbidden";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardContent, CardHeader, CardTitle, Num, PageHeader, Table, Td, Th, Tr } from "@/components/ui/primitives";
import { getT } from "@/server/i18n";
import { requirePageContext } from "@/server/session";
import { WorkflowPath } from "@/components/workflow-path";

export default async function SalesOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePageContext();
  const { t, locale } = await getT();
  if (!can(ctx.actor, "sales_orders.view")) return <Forbidden t={t} />;
  const { id } = await params;
  const so = await salesOrders.getSalesOrder(ctx, id).catch(() => null);
  if (!so) notFound();
  const a = ctx.actor;
  const f = (v: unknown) => formatNumber(locale, Number(v ?? 0));
  const active = so.status !== "CANCELLED" && so.status !== "CLOSED";
  const hasMo = so.mos.some((m) => m.status !== "CANCELLED");
  return (
    <>
      <PageHeader
        title={`${t("docs.salesOrder")} ${so.number}`}
        description={<span className="flex flex-wrap items-center gap-2"><StatusBadge t={t} group="SalesOrderStatus" value={so.status} /><Link href={`/customers/${so.customer.id}`} className="hover:underline">{so.customer.name}</Link><Link href={`/quotations/${so.quotation.id}`}><Badge><span className="num">{so.quotation.number}</span></Badge></Link></span>}
        actions={
          <>
            <DocLinks t={t} type="sales_order" id={so.id} />
            {active && !hasMo && can(a, "manufacturing.create") ? <ActionButton endpoint={`/sales-orders/${so.id}/manufacturing-orders`} label="salesOrders.createMo" variant="default" /> : null}
            {active && can(a, "deliveries.create") && so.items.some((i) => Number(i.manufacturedQuantity) > Number(i.deliveredQuantity)) ? <ActionButton endpoint={`/sales-orders/${so.id}/deliveries`} body={{ installationRequired: Number(so.quotation.installationCharge) > 0 }} label="deliveries.new" redirectTo="/deliveries/:id" confirmKey={null} /> : null}
            {active && can(a, "invoices.create") ? <ActionButton endpoint={`/sales-orders/${so.id}/invoice`} label="salesOrders.createInvoice" redirectTo="/invoices/:id" /> : null}
            {active && can(a, "payments.create") ? <Button asChild variant="outline"><Link href={`/payments/new?customerId=${so.customer.id}&salesOrderId=${so.id}`}>{t("salesOrders.recordPayment")}</Link></Button> : null}
            {so.status === "CONFIRMED" && can(a, "sales_orders.cancel") ? <ActionButton endpoint={`/sales-orders/${so.id}/cancel`} label="salesOrders.cancel" variant="ghost" prompt="quotations.reasonPrompt" /> : null}
          </>
        }
      />
      <WorkflowPath t={t} steps={[
        { labelKey: "nav.customers", href: `/customers/${so.customer.id}`, done: true },
        { labelKey: "nav.quotations", href: `/quotations/${so.quotation.id}`, done: true },
        { labelKey: "nav.salesOrders", href: `/sales-orders/${so.id}`, current: !hasMo, done: hasMo },
        { labelKey: "nav.manufacturing", href: so.mos[0] ? `/manufacturing/${so.mos[0].id}` : undefined, current: hasMo && !so.deliveries.length },
        { labelKey: "deliveries.title", href: so.deliveries[0] ? `/deliveries/${so.deliveries[0].id}` : undefined, current: Boolean(so.deliveries.length) },
        { labelKey: "nav.invoices", href: so.invoices[0] ? `/invoices/${so.invoices[0].id}` : undefined },
      ]} />
      <div className="grid gap-4">
        <Card>
          <Table>
            <thead><tr className="border-b">
              <Th>#</Th><Th>{t("quotations.product")}</Th><Th>{t("docs.size")}</Th><Th>{t("quotations.options")}</Th>
              <Th className="text-end">{t("quotations.quantity")}</Th><Th className="text-end">{t("salesOrders.manufactured")}</Th><Th className="text-end">{t("salesOrders.delivered")}</Th><Th className="text-end">{t("salesOrders.invoiced")}</Th><Th>{t("salesOrders.manufacturingOrders")}</Th>
            </tr></thead>
            <tbody>
              {so.items.map((i) => (
                <Tr key={i.id} className="align-top">
                  <Td><Num>{i.lineNo}</Num></Td>
                  <Td><p className="font-medium" dir="ltr">{i.product.name}</p><Num className="text-xs text-muted-foreground">{i.product.code}</Num></Td>
                  <Td><Num>{Number(i.quotationItem.width)} × {Number(i.quotationItem.height)}{i.quotationItem.thickness ? ` × ${Number(i.quotationItem.thickness)}` : ""}</Num></Td>
                  <Td><div className="flex flex-wrap gap-1">{i.quotationItem.options.map((o) => <Badge key={o.optionId}>{o.name}</Badge>)}</div></Td>
                  <Td className="text-end"><Num>{Number(i.quantity)}</Num></Td>
                  <Td className="text-end"><Num>{Number(i.manufacturedQuantity)}</Num></Td>
                  <Td className="text-end"><Num>{Number(i.deliveredQuantity)}</Num></Td>
                  <Td className="text-end"><Num>{Number(i.invoicedQuantity)}</Num></Td>
                  <Td>{i.mos.map((m) => <Link key={m.id} href={`/manufacturing/${m.id}`} className="block"><Num className="text-primary hover:underline">{m.number}</Num> <span className="text-xs text-muted-foreground">{t(`status.ManufacturingStatus.${m.status}`)}</span></Link>)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader><CardTitle>{t("salesOrders.deliveries")}</CardTitle></CardHeader>
            <CardContent className="grid gap-1 text-sm">
              {so.deliveries.length === 0 ? <p className="text-muted-foreground">{t("common.noResults")}</p> : so.deliveries.map((d) => (
                <Link key={d.id} href={`/deliveries/${d.id}`} className="flex justify-between hover:underline"><Num>{d.number}</Num><span>{t(`status.DeliveryStatus.${d.status}`)}</span></Link>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>{t("salesOrders.invoices")}</CardTitle></CardHeader>
            <CardContent className="grid gap-1 text-sm">
              {so.invoices.length === 0 ? <p className="text-muted-foreground">{t("common.noResults")}</p> : so.invoices.map((i) => (
                <Link key={i.id} href={`/invoices/${i.id}`} className="flex justify-between gap-2 hover:underline"><Num>{i.number}</Num><Num>{f(i.paidAmount)} / {f(i.total)}</Num><span>{t(`status.InvoiceStatus.${i.status}`)}</span></Link>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>{t("salesOrders.payments")}</CardTitle></CardHeader>
            <CardContent className="grid gap-1 text-sm">
              {so.payments.length === 0 ? <p className="text-muted-foreground">{t("common.noResults")}</p> : so.payments.map((p) => (
                <Link key={p.id} href={`/payments/${p.id}`} className="flex justify-between gap-2 hover:underline"><Num>{p.number}</Num><Num>{formatDate(locale, p.paymentDate)}</Num><Num className={p.status === "REVERSED" ? "line-through" : ""}>{f(p.amount)}</Num></Link>
              ))}
            </CardContent>
          </Card>
        </div>
        <Card>
          <CardContent className="grid gap-1.5 pt-5 text-sm sm:grid-cols-2">
            <p><span className="text-muted-foreground">{t("salesOrders.orderDate")}:</span> <Num>{formatDate(locale, so.orderDate)}</Num></p>
            <p><span className="text-muted-foreground">{t("salesOrders.requiredDate")}:</span> <Num>{so.requiredDate ? formatDate(locale, so.requiredDate) : "—"}</Num></p>
            <p><span className="text-muted-foreground">{t("salesOrders.deliveryAddress")}:</span> {so.deliveryAddress ?? "—"}</p>
            <p><span className="text-muted-foreground">{t("quotations.total")}:</span> <Num className="font-semibold">{f(so.total)} {so.currency}</Num></p>
            {so.cancelReason ? <p className="text-destructive sm:col-span-2">{so.cancelReason}</p> : null}
          </CardContent>
        </Card>
        <AttachmentsPanel entityType="sales_order" entityId={so.id} canUpload={can(a, "attachments.upload")} canDelete={can(a, "attachments.delete")} />
      </div>
    </>
  );
}
