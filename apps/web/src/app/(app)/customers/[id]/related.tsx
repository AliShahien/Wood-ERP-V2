import Link from "next/link";
import { can, quotations, receivables, salesOrders } from "@edge/core";
import { formatDate, formatNumber } from "@edge/i18n";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle, Num } from "@/components/ui/primitives";
import { getT } from "@/server/i18n";
import { requirePageContext } from "@/server/session";

/** Latest documents of the customer, each block shown only with the matching permission. */
export async function CustomerRelated({ customerId }: { customerId: string }) {
  const ctx = await requirePageContext();
  const { t, locale } = await getT();
  const a = ctx.actor;
  const [qts, sos, invs, pays] = await Promise.all([
    can(a, "quotations.view") ? quotations.listQuotations(ctx, { customerId, pageSize: 5 }) : null,
    can(a, "sales_orders.view") ? salesOrders.listSalesOrders(ctx, { customerId, pageSize: 5 }) : null,
    can(a, "invoices.view") ? receivables.listInvoices(ctx, { customerId, pageSize: 5 }) : null,
    can(a, "payments.view") ? receivables.listPayments(ctx, { customerId, pageSize: 5 }) : null,
  ]);
  const f = (v: unknown) => formatNumber(locale, Number(v ?? 0));
  const block = (title: string, href: string, rows: { id: string; href: string; number: string; date: Date; amount: unknown; group: string; status: string }[] | null) =>
    rows === null ? null : (
      <Card>
        <CardHeader className="flex-row items-center justify-between"><CardTitle>{title}</CardTitle><Link href={href} className="text-xs text-primary hover:underline">{t("common.all")}</Link></CardHeader>
        <CardContent className="grid gap-1.5 text-sm">
          {rows.length === 0 ? <p className="text-muted-foreground">{t("common.noResults")}</p> : rows.map((r) => (
            <Link key={r.id} href={r.href} className="flex items-center justify-between gap-2 hover:underline">
              <Num>{r.number}</Num><Num className="text-muted-foreground">{formatDate(locale, r.date)}</Num><Num>{f(r.amount)}</Num><StatusBadge t={t} group={r.group} value={r.status} />
            </Link>
          ))}
        </CardContent>
      </Card>
    );
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {block(t("customers.quotations"), `/quotations?customerId=${customerId}`, qts?.items.map((x) => ({ id: x.id, href: `/quotations/${x.id}`, number: x.number, date: x.quotationDate, amount: x.total, group: "QuotationStatus", status: x.status })) ?? null)}
      {block(t("customers.salesOrders"), `/sales-orders?customerId=${customerId}`, sos?.items.map((x) => ({ id: x.id, href: `/sales-orders/${x.id}`, number: x.number, date: x.orderDate, amount: x.total, group: "SalesOrderStatus", status: x.status })) ?? null)}
      {block(t("customers.invoices"), `/invoices?customerId=${customerId}`, invs?.items.map((x) => ({ id: x.id, href: `/invoices/${x.id}`, number: x.number, date: x.invoiceDate, amount: x.total, group: "InvoiceStatus", status: x.status })) ?? null)}
      {block(t("customers.payments"), `/payments?customerId=${customerId}`, pays?.items.map((x) => ({ id: x.id, href: `/payments/${x.id}`, number: x.number, date: x.paymentDate, amount: x.amount, group: "PaymentStatus", status: x.status })) ?? null)}
    </div>
  );
}
