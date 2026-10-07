import Link from "next/link";
import { notFound } from "next/navigation";
import { can, deliveries } from "@edge/core";
import { formatDate, formatNumber } from "@edge/i18n";
import { ActionButton } from "@/components/action-button";
import { AttachmentsPanel } from "@/components/attachments-panel";
import { DocLinks } from "@/components/doc-links";
import { Forbidden } from "@/components/forbidden";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle, Num, PageHeader, Table, Td, Th, Tr } from "@/components/ui/primitives";
import { getT } from "@/server/i18n";
import { requirePageContext } from "@/server/session";
import { CompleteForm, InstallationControl, ScheduleForm, SignaturePad } from "./delivery-client";

export default async function DeliveryPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePageContext();
  const { t, locale } = await getT();
  if (!can(ctx.actor, "deliveries.view")) return <Forbidden t={t} />;
  const { id } = await params;
  const d = await deliveries.getDelivery(ctx, id).catch(() => null);
  if (!d) notFound();
  const a = ctx.actor;
  const open = d.status === "PENDING" || d.status === "SCHEDULED";
  const canUpdate = can(a, "deliveries.update");
  const label = (i: (typeof d.items)[number]) => {
    const q = i.salesOrderItem.quotationItem;
    return `${i.salesOrderItem.product.name} — ${Number(q.width)}×${Number(q.height)}`;
  };
  const local = (x: Date | null) => (x ? new Date(x.getTime() - x.getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "");
  return (
    <>
      <PageHeader
        title={`${t("docs.deliveryNote")} ${d.number}`}
        description={<span className="flex flex-wrap items-center gap-2"><StatusBadge t={t} group="DeliveryStatus" value={d.status} /><Link href={`/customers/${d.customer.id}`} className="hover:underline">{d.customer.name}</Link><Num>{d.customer.phone ?? ""}</Num><Link href={`/sales-orders/${d.salesOrder.id}`} className="num hover:underline">{d.salesOrder.number}</Link></span>}
        actions={
          <>
            <DocLinks t={t} type="delivery" id={d.id} />
            {open && can(a, "deliveries.cancel") ? <ActionButton endpoint={`/deliveries/${d.id}/cancel`} label="deliveries.cancel" variant="ghost" prompt="quotations.reasonPrompt" /> : null}
          </>
        }
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="grid gap-1.5 pt-5 text-sm">
            <p><span className="text-muted-foreground">{t("deliveries.address")}:</span> {d.address}</p>
            <p><span className="text-muted-foreground">{t("deliveries.scheduledDate")}:</span> <Num>{d.scheduledDate ? formatDate(locale, d.scheduledDate, true) : "—"}</Num></p>
            <p><span className="text-muted-foreground">{t("deliveries.driver")}:</span> {d.driverName ?? "—"} · {d.vehicle ?? "—"}</p>
            <p className="flex items-center gap-2"><span className="text-muted-foreground">{t("deliveries.installation")}:</span>
              {d.installationStatus !== "NOT_REQUIRED" && d.status !== "CANCELLED" && canUpdate ? <InstallationControl id={d.id} value={d.installationStatus} /> : t(`status.InstallationStatus.${d.installationStatus}`)}
            </p>
            {d.deliveredAt ? <p><span className="text-muted-foreground">{t("deliveries.delivered")}:</span> <Num>{formatDate(locale, d.deliveredAt, true)}</Num> · {d.receivedByName}</p> : null}
            {d.notes ? <p>{d.notes}</p> : null}
            {d.cancelReason ? <p className="text-destructive">{d.cancelReason}</p> : null}
          </CardContent>
        </Card>
        <Card>
          <Table>
            <thead><tr className="border-b"><Th>{t("docs.item")}</Th><Th className="text-end">{t("deliveries.planned")}</Th><Th className="text-end">{t("deliveries.delivered")}</Th></tr></thead>
            <tbody>
              {d.items.map((i) => (
                <Tr key={i.id}><Td dir="ltr" className="text-start">{label(i)}</Td><Td className="text-end"><Num>{formatNumber(locale, Number(i.quantity), 0)}</Num></Td><Td className="text-end"><Num>{formatNumber(locale, Number(i.deliveredQuantity), 0)}</Num></Td></Tr>
              ))}
            </tbody>
          </Table>
        </Card>
        {open && canUpdate ? (
          <>
            <Card>
              <CardHeader><CardTitle>{t("deliveries.schedule")}</CardTitle></CardHeader>
              <CardContent><ScheduleForm id={d.id} initial={{ scheduledDate: local(d.scheduledDate), driverName: d.driverName ?? "", vehicle: d.vehicle ?? "", address: d.address }} /></CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>{t("deliveries.complete")}</CardTitle></CardHeader>
              <CardContent><CompleteForm id={d.id} installationRequired={d.installationStatus !== "NOT_REQUIRED"} lines={d.items.map((i) => ({ id: i.id, label: label(i), quantity: Number(i.quantity) }))} /></CardContent>
            </Card>
          </>
        ) : null}
        {canUpdate && d.status !== "CANCELLED" ? (
          <Card>
            <CardHeader><CardTitle>{t("deliveries.signature")}</CardTitle></CardHeader>
            <CardContent><SignaturePad id={d.id} existingId={d.signatureId} /></CardContent>
          </Card>
        ) : null}
        <AttachmentsPanel entityType="delivery" entityId={d.id} canUpload={can(a, "attachments.upload")} canDelete={can(a, "attachments.delete")} categories={["PHOTO", "SIGNATURE", "DOCUMENT"]} />
      </div>
    </>
  );
}
