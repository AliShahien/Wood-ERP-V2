import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil } from "@/components/ui/material-icons";
import { can, quotations } from "@edge/core";
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

export default async function QuotationPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePageContext();
  const { t, locale } = await getT();
  if (!can(ctx.actor, "quotations.view")) return <Forbidden t={t} />;
  const { id } = await params;
  const q = await quotations.getQuotation(ctx, id).catch(() => null);
  if (!q) notFound();
  const f = (v: unknown) => formatNumber(locale, Number(v ?? 0));
  const s = q.status;
  const a = ctx.actor;
  return (
    <>
      <PageHeader
        title={`${t("docs.quotation")} ${q.number}`}
        description={<span className="flex flex-wrap items-center gap-2"><StatusBadge t={t} group="QuotationStatus" value={s} /><Link href={`/customers/${q.customer.id}`} className="hover:underline">{q.customer.name}</Link>{q.salesOrder ? <Link href={`/sales-orders/${q.salesOrder.id}`}><Badge tone="info">{t("quotations.salesOrder")}: <span className="num">{q.salesOrder.number}</span></Badge></Link> : null}</span>}
        actions={
          <>
            <DocLinks t={t} type="quotation" id={q.id} />
            {s === "DRAFT" && can(a, "quotations.edit") ? <Button asChild variant="outline"><Link href={`/quotations/${q.id}/edit`}><Pencil />{t("common.edit")}</Link></Button> : null}
            {s === "DRAFT" && can(a, "quotations.submit") ? <ActionButton endpoint={`/quotations/${q.id}/submit`} label="quotations.submit" variant="default" /> : null}
            {s === "SUBMITTED" && can(a, "quotations.approve") ? (
              <>
                <ActionButton endpoint={`/quotations/${q.id}/approve`} label="quotations.approve" variant="default" />
                <ActionButton endpoint={`/quotations/${q.id}/return`} label="quotations.returnToDraft" prompt="quotations.reasonPrompt" />
                <ActionButton endpoint={`/quotations/${q.id}/reject`} label="quotations.reject" variant="destructive" prompt="quotations.reasonPrompt" />
              </>
            ) : null}
            {s === "APPROVED" && can(a, "sales_orders.create") ? <ActionButton endpoint={`/quotations/${q.id}/convert`} label="quotations.convert" variant="default" redirectTo="/sales-orders/:id" /> : null}
            {["APPROVED", "REJECTED", "EXPIRED", "CANCELLED"].includes(s) && can(a, "quotations.create") ? <ActionButton endpoint={`/quotations/${q.id}/revise`} label="quotations.revise" redirectTo="/quotations/:id" /> : null}
            {["DRAFT", "SUBMITTED", "APPROVED"].includes(s) && can(a, "quotations.cancel") ? <ActionButton endpoint={`/quotations/${q.id}/cancel`} label="quotations.cancel" variant="ghost" prompt="quotations.reasonPrompt" /> : null}
          </>
        }
      />
      <WorkflowPath t={t} steps={[
        { labelKey: "nav.customers", href: `/customers/${q.customer.id}`, done: true },
        { labelKey: "nav.measurements", href: q.items[0]?.measurement ? `/measurements/${q.items[0].measurement.id}` : undefined, done: Boolean(q.items[0]?.measurement) },
        { labelKey: "nav.quotations", href: `/quotations/${q.id}`, current: !q.salesOrder, done: Boolean(q.salesOrder) },
        { labelKey: "nav.salesOrders", href: q.salesOrder ? `/sales-orders/${q.salesOrder.id}` : undefined, current: Boolean(q.salesOrder) },
        { labelKey: "nav.manufacturing" }, { labelKey: "deliveries.title" },
      ]} />
      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <Card>
          <Table>
            <thead><tr className="border-b">
              <Th>#</Th><Th>{t("quotations.product")}</Th><Th>{t("docs.size")}</Th><Th>{t("quotations.options")}</Th>
              <Th className="text-end">{t("quotations.quantity")}</Th><Th className="text-end">{t("quotations.unitPrice")}</Th><Th className="text-end">{t("quotations.lineDiscount")}</Th><Th className="text-end">{t("quotations.lineTotal")}</Th>
            </tr></thead>
            <tbody>
              {q.items.map((i) => (
                <Tr key={i.id} className="align-top">
                  <Td><Num>{i.lineNo}</Num></Td>
                  <Td>
                    <div className="flex items-center gap-2">
                      {i.product.images[0] ? <img src={`/api/v1/product-images/${i.product.images[0].id}`} alt="" className="size-10 rounded object-cover" /> : null}
                      <div><p className="font-medium" dir="ltr">{i.product.name}</p><Num className="text-xs text-muted-foreground">{i.product.code}</Num>{i.description ? <p className="text-xs text-muted-foreground">{i.description}</p> : null}</div>
                    </div>
                  </Td>
                  <Td><Num>{Number(i.width)} × {Number(i.height)}{i.thickness ? ` × ${Number(i.thickness)}` : ""}</Num>{i.measurement ? <Link href={`/measurements/${i.measurement.id}`} className="block text-xs text-primary hover:underline">{i.measurement.number}</Link> : null}</Td>
                  <Td><div className="flex flex-wrap gap-1">{i.options.map((o) => <Badge key={o.optionId}>{o.name}</Badge>)}</div></Td>
                  <Td className="text-end"><Num>{Number(i.quantity)}</Num></Td>
                  <Td className="text-end"><Num>{f(i.unitPrice)}</Num></Td>
                  <Td className="text-end"><Num>{f(i.discount)}</Num></Td>
                  <Td className="text-end font-medium"><Num>{f(i.lineTotal)}</Num></Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>
        <div className="grid content-start gap-4">
          <Card>
            <CardContent className="pt-5">
              <dl className="grid grid-cols-2 gap-y-1.5 text-sm">
                <dt className="text-muted-foreground">{t("quotations.subtotal")}</dt><dd className="num text-end">{f(q.subtotal)}</dd>
                <dt className="text-muted-foreground">{t("quotations.discount")}</dt><dd className="num text-end">{f(q.discountTotal)}</dd>
                <dt className="text-muted-foreground">{t("quotations.installation")}</dt><dd className="num text-end">{f(q.installationCharge)}</dd>
                <dt className="text-muted-foreground">{t("quotations.transportation")}</dt><dd className="num text-end">{f(q.transportationCharge)}</dd>
                {q.taxEnabled ? <><dt className="text-muted-foreground">{t("quotations.tax")} (<Num>{Number(q.taxRate)}%</Num>)</dt><dd className="num text-end">{f(q.taxTotal)}</dd></> : null}
                <dt className="text-base font-semibold">{t("quotations.total")}</dt><dd className="num text-end text-base font-semibold">{f(q.total)} {q.currency}</dd>
                <dt className="text-muted-foreground">{t("quotations.deposit")}</dt><dd className="num text-end">{f(q.depositRequired)}</dd>
                {q.estimatedCost !== null ? <><dt className="text-muted-foreground">{t("quotations.estimatedCost")}</dt><dd className="num text-end">{f(q.estimatedCost)}</dd></> : null}
              </dl>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="grid gap-1.5 pt-5 text-sm">
              <p><span className="text-muted-foreground">{t("quotations.date")}:</span> <Num>{formatDate(locale, q.quotationDate)}</Num></p>
              <p><span className="text-muted-foreground">{t("quotations.validUntil")}:</span> <Num>{formatDate(locale, q.validUntil)}</Num></p>
              <p><span className="text-muted-foreground">{t("fields.showroom")}:</span> {q.showroom.name}</p>
              <p><span className="text-muted-foreground">{t("quotations.salesperson")}:</span> {q.salesperson.fullName}</p>
              {q.rejectReason ? <p className="text-destructive">{q.rejectReason}</p> : null}
              {q.paymentTerms ? <p><span className="text-muted-foreground">{t("quotations.paymentTerms")}:</span> {q.paymentTerms}</p> : null}
              {q.notes ? <p className="whitespace-pre-line">{q.notes}</p> : null}
            </CardContent>
          </Card>
          {q.revisions.length || q.parent ? (
            <Card>
              <CardHeader><CardTitle>{t("quotations.revisions")}</CardTitle></CardHeader>
              <CardContent className="grid gap-1 text-sm">
                {q.parent ? <Link href={`/quotations/${q.parent.id}`} className="num hover:underline">{q.parent.number}</Link> : null}
                {q.revisions.map((r) => <Link key={r.id} href={`/quotations/${r.id}`} className="num hover:underline">{r.number} · {t(`status.QuotationStatus.${r.status}`)}</Link>)}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
      <div className="mt-4">
        <AttachmentsPanel entityType="quotation" entityId={q.id} canUpload={can(a, "attachments.upload")} canDelete={can(a, "attachments.delete")} />
      </div>
    </>
  );
}
