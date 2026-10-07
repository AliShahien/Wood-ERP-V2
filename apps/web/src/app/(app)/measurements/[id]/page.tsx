import Link from "next/link";
import { notFound } from "next/navigation";
import { can, measurements } from "@edge/core";
import { formatDate } from "@edge/i18n";
import { ActionButton } from "@/components/action-button";
import { AttachmentsPanel } from "@/components/attachments-panel";
import { Forbidden } from "@/components/forbidden";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardContent, CardHeader, CardTitle, Num, PageHeader, Table, Td, Th, Tr } from "@/components/ui/primitives";
import { getT } from "@/server/i18n";
import { requirePageContext } from "@/server/session";
import { MeasurementForm } from "../measurement-form";

export default async function MeasurementPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePageContext();
  const { t, locale } = await getT();
  if (!can(ctx.actor, "measurements.view")) return <Forbidden t={t} />;
  const { id } = await params;
  const m = await measurements.getMeasurement(ctx, id).catch(() => null);
  if (!m) notFound();
  const v = m.versions[0]!;
  const a = ctx.actor;
  const s = (x: unknown) => (x === null || x === undefined ? "" : String(x));
  return (
    <>
      <PageHeader
        title={`${t("nav.measurements")} ${m.number}`}
        description={<span className="flex flex-wrap items-center gap-2"><StatusBadge t={t} group="MeasurementStatus" value={m.status} /><Link href={`/customers/${m.customer.id}`} className="hover:underline">{m.customer.name}</Link>{m.product ? <Badge dir="ltr">{m.product.name}</Badge> : null}<Num>v{m.currentVersion}</Num></span>}
        actions={
          <>
            {m.status === "DRAFT" && can(a, "measurements.approve") ? <ActionButton endpoint={`/measurements/${m.id}/approve`} label="measurements.approve" variant="default" /> : null}
            {m.product && m.status !== "CANCELLED" && can(a, "quotations.create") ? <Button asChild variant="outline"><Link href={`/quotations/new?customerId=${m.customer.id}&productId=${m.product.id}&measurementId=${m.id}`}>{t("measurements.useInQuotation")}</Link></Button> : null}
            {m.status !== "CANCELLED" && can(a, "measurements.edit") ? <ActionButton endpoint={`/measurements/${m.id}/cancel`} label="common.cancel" variant="ghost" /> : null}
          </>
        }
      />
      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        {m.status !== "CANCELLED" && can(a, "measurements.edit") ? (
          <MeasurementForm
            measurementId={m.id}
            customer={null}
            product={null}
            approvedLocked={Boolean(v.approvedAt)}
            initial={{
              width: s(v.width), height: s(v.height), thickness: s(v.thickness), wallThickness: s(v.wallThickness), openingType: s(v.openingType),
              openingDirection: s(v.openingDirection), frameDetails: s(v.frameDetails), installationNotes: s(v.installationNotes), notes: s(v.notes), location: s(m.location), room: s(m.room),
            }}
          />
        ) : (
          <Card><CardContent className="grid gap-2 pt-5 text-sm">
            <p className="text-lg font-semibold"><Num>{Number(v.width)} × {Number(v.height)}{v.thickness ? ` × ${Number(v.thickness)}` : ""} mm</Num></p>
            {v.openingType ? <p>{t("measurements.openingType")}: {v.openingType}</p> : null}
            {v.frameDetails ? <p>{v.frameDetails}</p> : null}
          </CardContent></Card>
        )}
        <div className="grid content-start gap-4">
          <Card>
            <CardContent className="grid gap-1.5 pt-5 text-sm">
              <p><span className="text-muted-foreground">{t("measurements.location")}:</span> {m.location ?? "—"}</p>
              <p><span className="text-muted-foreground">{t("measurements.room")}:</span> {m.room ?? "—"}</p>
              <p><span className="text-muted-foreground">{t("measurements.measuredBy")}:</span> {m.measuredBy.fullName}</p>
              <p><span className="text-muted-foreground">{t("measurements.date")}:</span> <Num>{formatDate(locale, m.measurementDate)}</Num></p>
              {m.quotation ? <p><span className="text-muted-foreground">{t("measurements.quotation")}:</span> <Link href={`/quotations/${m.quotation.id}`} className="num hover:underline">{m.quotation.number}</Link></p> : null}
              {m.salesOrder ? <p><span className="text-muted-foreground">{t("docs.salesOrderRef")}:</span> <Link href={`/sales-orders/${m.salesOrder.id}`} className="num hover:underline">{m.salesOrder.number}</Link></p> : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>{t("measurements.versions")}</CardTitle></CardHeader>
            <Table>
              <thead><tr className="border-b"><Th>v</Th><Th>{t("docs.size")}</Th><Th>{t("measurements.changeReason")}</Th></tr></thead>
              <tbody>
                {m.versions.map((x) => (
                  <Tr key={x.id}>
                    <Td><Num>{x.version}</Num>{x.approvedAt ? <Badge tone="success" className="ms-1">✓</Badge> : null}</Td>
                    <Td><Num>{Number(x.width)} × {Number(x.height)}</Num></Td>
                    <Td className="text-xs text-muted-foreground">{x.changeReason ?? "—"}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </Card>
          <AttachmentsPanel entityType="measurement" entityId={m.id} canUpload={can(a, "attachments.upload")} canDelete={can(a, "attachments.delete")} categories={["PHOTO", "DRAWING", "DOCUMENT"]} />
        </div>
      </div>
    </>
  );
}
