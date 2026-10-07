import Link from "next/link";
import { notFound } from "next/navigation";
import { can, receivables } from "@edge/core";
import { formatDate, formatNumber } from "@edge/i18n";
import { ActionButton } from "@/components/action-button";
import { DocLinks } from "@/components/doc-links";
import { Forbidden } from "@/components/forbidden";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle, Num, PageHeader } from "@/components/ui/primitives";
import { getT } from "@/server/i18n";
import { requirePageContext } from "@/server/session";

export default async function PaymentPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePageContext();
  const { t, locale } = await getT();
  if (!can(ctx.actor, "payments.view")) return <Forbidden t={t} />;
  const { id } = await params;
  const p = await receivables.getPayment(ctx, id).catch(() => null);
  if (!p) notFound();
  const f = (v: unknown) => formatNumber(locale, Number(v ?? 0));
  const allocated = p.allocations.filter((a) => !a.reversedAt).reduce((s, a) => s + Number(a.amount), 0);
  return (
    <>
      <PageHeader
        title={`${t("payments.receipt")} ${p.number}`}
        description={<span className="flex items-center gap-2"><StatusBadge t={t} group="PaymentStatus" value={p.status} /><Link href={`/customers/${p.customer.id}`} className="hover:underline">{p.customer.name}</Link></span>}
        actions={
          <>
            <DocLinks t={t} type="payment" id={p.id} />
            {p.status === "POSTED" && can(ctx.actor, "payments.reverse") ? <ActionButton endpoint={`/payments/${p.id}/reverse`} label="payments.reverse" variant="destructive" prompt="quotations.reasonPrompt" /> : null}
          </>
        }
      />
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardContent className="grid gap-1.5 pt-5 text-sm">
            <p className="text-2xl font-semibold"><Num>{f(p.amount)}</Num></p>
            <p><span className="text-muted-foreground">{t("payments.date")}:</span> <Num>{formatDate(locale, p.paymentDate)}</Num></p>
            <p><span className="text-muted-foreground">{t("payments.method")}:</span> {t(`status.PaymentMethod.${p.method}`)}</p>
            <p><span className="text-muted-foreground">{t("payments.account")}:</span> {p.cashAccount.name}</p>
            {p.reference ? <p><span className="text-muted-foreground">{t("payments.reference")}:</span> <Num>{p.reference}</Num></p> : null}
            {p.salesOrder ? <p><span className="text-muted-foreground">{t("docs.salesOrderRef")}:</span> <Link href={`/sales-orders/${p.salesOrder.id}`} className="num hover:underline">{p.salesOrder.number}</Link></p> : null}
            {p.notes ? <p className="whitespace-pre-line">{p.notes}</p> : null}
            {p.reverseReason ? <p className="text-destructive">{p.reverseReason}</p> : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>{t("invoices.allocations")}</CardTitle></CardHeader>
          <CardContent className="grid gap-1 text-sm">
            {p.allocations.map((a) => (
              <Link key={a.id} href={`/invoices/${a.invoice.id}`} className={`flex justify-between hover:underline ${a.reversedAt ? "line-through opacity-60" : ""}`}><Num>{a.invoice.number}</Num><Num>{f(a.amount)}</Num></Link>
            ))}
            <p className="mt-2 flex justify-between border-t pt-2"><span className="text-muted-foreground">{t("payments.unallocated")}</span><Num>{p.status === "POSTED" ? f(Number(p.amount) - allocated) : "0"}</Num></p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
