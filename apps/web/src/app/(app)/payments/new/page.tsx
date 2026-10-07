import { can, cashAccounts, customers, salesOrders } from "@edge/core";
import { Forbidden } from "@/components/forbidden";
import { PageHeader } from "@/components/ui/primitives";
import { getT } from "@/server/i18n";
import { requirePageContext } from "@/server/session";
import { PaymentForm } from "./payment-form";

export default async function NewPaymentPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requirePageContext();
  const { t } = await getT();
  if (!can(ctx.actor, "payments.create")) return <Forbidden t={t} />;
  const sp = await searchParams;
  const [accounts, customer] = await Promise.all([
    cashAccounts.listCashAccounts(ctx),
    sp.customerId ? customers.getCustomer(ctx, sp.customerId).catch(() => null) : null,
  ]);
  const orders = customer && can(ctx.actor, "sales_orders.view") ? (await salesOrders.listSalesOrders(ctx, { customerId: customer.id, pageSize: 50 })).items.filter((o) => o.status !== "CANCELLED") : [];
  return (
    <>
      <PageHeader title={t("payments.new")} />
      <PaymentForm
        accounts={accounts.filter((a) => a.status === "ACTIVE").map((a) => ({ id: a.id, name: a.name, type: a.type }))}
        initialCustomer={customer ? { id: customer.id, label: customer.name, sub: customer.code } : null}
        orders={orders.map((o) => ({ id: o.id, number: o.number, total: String(o.total) }))}
        initialSalesOrderId={sp.salesOrderId ?? ""}
      />
    </>
  );
}
