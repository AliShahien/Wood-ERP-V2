import { can, cashAccounts, purchasing, suppliers } from "@edge/core";
import { Forbidden } from "@/components/forbidden";
import { PageHeader } from "@/components/ui/primitives";
import { getT } from "@/server/i18n";
import { requirePageContext } from "@/server/session";
import { SupplierPaymentForm } from "./sp-form";

export default async function NewSupplierPaymentPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requirePageContext();
  const { t } = await getT();
  if (!can(ctx.actor, "supplier_payments.create")) return <Forbidden t={t} />;
  const sp = await searchParams;
  const [accounts, supplier, invoices] = await Promise.all([
    cashAccounts.listCashAccounts(ctx),
    sp.supplierId ? suppliers.getSupplier(ctx, sp.supplierId).catch(() => null) : null,
    sp.supplierId && can(ctx.actor, "supplier_invoices.view") ? purchasing.listSupplierInvoices(ctx, { supplierId: sp.supplierId, pageSize: 50 }).then((r) => r.items.filter((i) => i.status === "POSTED" || i.status === "PARTIALLY_PAID")) : Promise.resolve([]),
  ]);
  return (
    <>
      <PageHeader title={t("purchasing.newSupplierPayment")} />
      <SupplierPaymentForm
        accounts={accounts.filter((a) => a.status === "ACTIVE").map((a) => ({ id: a.id, name: a.name }))}
        supplier={supplier ? { id: supplier.id, label: supplier.name, sub: supplier.code } : null}
        invoices={invoices.map((i) => ({ id: i.id, number: i.number, remaining: Number(i.total) - Number(i.paidAmount) }))}
        invoiceId={sp.invoiceId ?? ""}
      />
    </>
  );
}
