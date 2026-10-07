import Link from "next/link";
import { notFound } from "next/navigation";
import { can, purchasing } from "@edge/core";
import { formatDate, formatNumber } from "@edge/i18n";
import { ActionButton } from "@/components/action-button";
import { Forbidden } from "@/components/forbidden";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, Num, PageHeader } from "@/components/ui/primitives";
import { getT } from "@/server/i18n";
import { requirePageContext } from "@/server/session";

export default async function SupplierPaymentPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePageContext();
  const { t, locale } = await getT();
  if (!can(ctx.actor, "supplier_payments.view")) return <Forbidden t={t} />;
  const { id } = await params;
  const p = await purchasing.getSupplierPayment(ctx, id).catch(() => null);
  if (!p) notFound();
  return (
    <>
      <PageHeader
        title={`${t("purchasing.supplierPayments")} ${p.number}`}
        description={<span className="flex items-center gap-2"><StatusBadge t={t} group="PaymentStatus" value={p.status} /><Link href={`/suppliers/${p.supplier.id}`} className="hover:underline">{p.supplier.name}</Link></span>}
        actions={p.status === "POSTED" && can(ctx.actor, "supplier_payments.reverse") ? <ActionButton endpoint={`/supplier-payments/${p.id}/reverse`} label="purchasing.reverse" variant="destructive" prompt="quotations.reasonPrompt" /> : null}
      />
      <Card className="max-w-xl">
        <CardContent className="grid gap-1.5 pt-5 text-sm">
          <p className="text-2xl font-semibold"><Num>{formatNumber(locale, Number(p.amount))}</Num></p>
          <p><span className="text-muted-foreground">{t("payments.date")}:</span> <Num>{formatDate(locale, p.paymentDate)}</Num></p>
          <p><span className="text-muted-foreground">{t("payments.method")}:</span> {t(`status.PaymentMethod.${p.method}`)}</p>
          <p><span className="text-muted-foreground">{t("payments.account")}:</span> {p.cashAccount.name}</p>
          {p.invoice ? <p><span className="text-muted-foreground">{t("purchasing.invoice")}:</span> <Link href={`/supplier-invoices/${p.invoice.id}`} className="num hover:underline">{p.invoice.number}</Link></p> : null}
          {p.reference ? <p><span className="text-muted-foreground">{t("payments.reference")}:</span> <Num>{p.reference}</Num></p> : null}
          {p.notes ? <p>{p.notes}</p> : null}
          {p.reverseReason ? <p className="text-destructive">{p.reverseReason}</p> : null}
        </CardContent>
      </Card>
    </>
  );
}
