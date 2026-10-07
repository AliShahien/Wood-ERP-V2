import Link from "next/link";
import { notFound } from "next/navigation";
import { can, manufacturing, productionStages, settings, warehouses } from "@edge/core";
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
import { IssuePanel, OperationActions, QcForm } from "./mo-client";

export default async function ManufacturingOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePageContext();
  const { t, locale } = await getT();
  if (!can(ctx.actor, "manufacturing.view")) return <Forbidden t={t} />;
  const { id } = await params;
  const mo = await manufacturing.getManufacturingOrder(ctx, id).catch(() => null);
  if (!mo) notFound();
  const a = ctx.actor;
  const s = mo.status;
  const q = (v: unknown, d = 2) => formatNumber(locale, Number(v ?? 0), d);
  const showCost = can(a, "costing.view");
  const issuable = ["APPROVED", "WAITING_MATERIALS", "MATERIALS_ISSUED", "IN_PRODUCTION", "QUALITY_CHECK"].includes(s);
  const [whs, stages, st, variance] = await Promise.all([
    issuable && can(a, "material_issues.create") ? warehouses.listWarehouses(ctx, { pageSize: 100, status: "ACTIVE" }).then((r) => r.items).catch(() => []) : Promise.resolve([]),
    s === "QUALITY_CHECK" && can(a, "quality.create") ? productionStages.listStages(ctx) : Promise.resolve([]),
    settings.readSettings(ctx.db),
    showCost && mo.items.length ? manufacturing.costVariance(ctx, id) : Promise.resolve(null),
  ]);
  const allowedWh = a.warehouseIds.length && !a.isSuperAdmin ? whs.filter((w) => a.warehouseIds.includes(w.id)) : whs;
  const opts = mo.salesOrderItem.quotationItem.options;

  return (
    <>
      <PageHeader
        title={`${t("manufacturing.order")} ${mo.number}`}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge t={t} group="ManufacturingStatus" value={s} /><StatusBadge t={t} group="Priority" value={mo.priority} />
            <Link href={`/sales-orders/${mo.salesOrder.id}`} className="num hover:underline">{mo.salesOrder.number}</Link> · {mo.customer.name}
          </span>
        }
        actions={
          <>
            <DocLinks t={t} type="manufacturing_order" id={mo.id} />
            {s === "DRAFT" && can(a, "manufacturing.approve") ? <ActionButton endpoint={`/manufacturing-orders/${mo.id}/approve`} label="manufacturing.approve" variant="default" /> : null}
            {s === "MATERIALS_ISSUED" && can(a, "manufacturing.start") ? <ActionButton endpoint={`/manufacturing-orders/${mo.id}/start`} label="manufacturing.startProduction" variant="default" /> : null}
            {s !== "CANCELLED" && s !== "COMPLETED" && can(a, "expenses.create") ? <Button asChild variant="outline"><Link href={`/expenses?new=1&moId=${mo.id}`}>{t("expenses.new")}</Link></Button> : null}
            {["DRAFT", "APPROVED", "WAITING_MATERIALS", "MATERIALS_ISSUED"].includes(s) && can(a, "manufacturing.cancel") ? <ActionButton endpoint={`/manufacturing-orders/${mo.id}/cancel`} label="manufacturing.cancel" variant="ghost" prompt="quotations.reasonPrompt" /> : null}
          </>
        }
      />
      <div className="grid gap-4">
        <div className="grid gap-4 md:grid-cols-[auto_1fr]">
          {mo.product.images[0] ? <img src={`/api/v1/product-images/${mo.product.images[0].id}`} alt="" className="h-40 w-32 rounded-md border object-cover" /> : null}
          <Card>
            <CardContent className="grid gap-2 pt-5 text-sm sm:grid-cols-3">
              <p><span className="text-muted-foreground">{t("manufacturing.product")}:</span> <span dir="ltr">{mo.product.name}</span> <Num className="text-muted-foreground">{mo.product.code}</Num></p>
              <p><span className="text-muted-foreground">{t("manufacturing.size")}:</span> <Num className="font-semibold">{Number(mo.width)} × {Number(mo.height)}{mo.thickness ? ` × ${Number(mo.thickness)}` : ""} mm</Num></p>
              <p><span className="text-muted-foreground">{t("manufacturing.quantity")}:</span> <Num className="font-semibold">{Number(mo.quantity)}</Num></p>
              <p><span className="text-muted-foreground">{t("manufacturing.bom")}:</span> <Link href={`/bom/${mo.bom.id}`} className="hover:underline">v{mo.bom.version} {mo.bom.name}</Link></p>
              <p><span className="text-muted-foreground">{t("manufacturing.measurement")}:</span> {mo.measurementVersion ? <Link href={`/measurements/${mo.measurementVersion.measurement.id}`} className="num hover:underline">{mo.measurementVersion.measurement.number} v{mo.measurementVersion.version}</Link> : "—"}</p>
              <p><span className="text-muted-foreground">{t("manufacturing.requiredDate")}:</span> <Num>{mo.requiredDate ? formatDate(locale, mo.requiredDate) : "—"}</Num></p>
              <p><span className="text-muted-foreground">{t("manufacturing.assignedTo")}:</span> {mo.assignedTo?.fullName ?? "—"}</p>
              <div className="flex flex-wrap gap-1 sm:col-span-2">{opts.map((o) => <Badge key={o.optionId}>{o.name}</Badge>)}</div>
              {mo.notes ? <p className="sm:col-span-3">{mo.notes}</p> : null}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader><CardTitle>{t("manufacturing.requirements")}</CardTitle></CardHeader>
          {mo.items.length === 0 ? <CardContent className="text-sm text-muted-foreground">{t("manufacturing.noRequirements")}</CardContent> : (
            <Table>
              <thead><tr className="border-b">
                <Th>{t("common.code")}</Th><Th>{t("manufacturing.material")}</Th><Th>{t("fields.unit")}</Th>
                <Th className="text-end">{t("manufacturing.required")}</Th><Th className="text-end">{t("manufacturing.issued")}</Th><Th className="text-end">{t("manufacturing.returned")}</Th><Th className="text-end">{t("manufacturing.remaining")}</Th>
              </tr></thead>
              <tbody>
                {mo.items.map((i) => {
                  const rem = Number(i.requiredQuantity) - Number(i.issuedQuantity) + Number(i.returnedQuantity);
                  return (
                    <Tr key={i.id}>
                      <Td><Num className="text-muted-foreground">{i.material.code}</Num></Td>
                      <Td>{i.material.name}</Td>
                      <Td>{i.material.unit.name}</Td>
                      <Td className="text-end"><Num>{q(i.requiredQuantity, 3)}</Num></Td>
                      <Td className="text-end"><Num>{q(i.issuedQuantity, 3)}</Num></Td>
                      <Td className="text-end"><Num>{q(i.returnedQuantity, 3)}</Num></Td>
                      <Td className="text-end"><Num className={rem > 0 ? "font-semibold text-warning" : "text-success"}>{q(Math.max(rem, 0), 3)}</Num></Td>
                    </Tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </Card>

        <Card>
          <CardHeader><CardTitle>{t("manufacturing.issues")}</CardTitle></CardHeader>
          <CardContent className="grid gap-3">
            {mo.materialIssues.length ? (
              <ul className="divide-y text-sm">
                {mo.materialIssues.map((mi) => (
                  <li key={mi.id} className="flex flex-wrap items-center gap-3 py-2">
                    <Link href={`/material-issues/${mi.id}`} className="num font-medium hover:underline">{mi.number}</Link>
                    <StatusBadge t={t} group="MaterialIssueType" value={mi.type} />
                    <StatusBadge t={t} group="DocStatus" value={mi.status} />
                    <span className="text-muted-foreground">{mi.warehouse.name}</span>
                    <Num className="text-muted-foreground">{formatDate(locale, mi.issueDate)}</Num>
                  </li>
                ))}
              </ul>
            ) : null}
            {issuable && can(a, "material_issues.create") && allowedWh.length ? (
              <IssuePanel moId={mo.id} warehouses={allowedWh.map((w) => ({ id: w.id, name: w.name }))} materials={mo.items.filter((i) => Number(i.issuedQuantity) > Number(i.returnedQuantity)).map((i) => ({ id: i.materialId, name: i.material.name }))} />
            ) : null}
          </CardContent>
        </Card>

        {mo.operations.length ? (
          <Card>
            <CardHeader><CardTitle>{t("manufacturing.operations")}</CardTitle></CardHeader>
            <Table>
              <thead><tr className="border-b"><Th>#</Th><Th>{t("production.stage")}</Th><Th>{t("common.status")}</Th><Th>{t("production.employee")}</Th><Th>{t("production.startedAt")}</Th><Th>{t("production.endedAt")}</Th><Th className="text-end">{t("production.laborHours")}</Th><Th /></tr></thead>
              <tbody>
                {mo.operations.map((op) => (
                  <Tr key={op.id}>
                    <Td><Num>{op.sequence}</Num></Td>
                    <Td>{locale === "ar" ? op.stage.nameAr : op.stage.nameEn}{op.notes ? <p className="text-xs text-muted-foreground">{op.notes}</p> : null}{op.isDelayed ? <p className="text-xs text-destructive">{op.delayReason}</p> : null}</Td>
                    <Td><StatusBadge t={t} group="OperationStatus" value={op.status} /></Td>
                    <Td>{op.employee?.fullName ?? "—"}</Td>
                    <Td><Num>{op.startedAt ? formatDate(locale, op.startedAt, true) : "—"}</Num></Td>
                    <Td><Num>{op.endedAt ? formatDate(locale, op.endedAt, true) : "—"}</Num></Td>
                    <Td className="text-end"><Num>{q(op.laborHours)}</Num></Td>
                    <Td><OperationActions opId={op.id} status={op.status} canEdit={s === "IN_PRODUCTION" && can(a, "production.update")} /></Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </Card>
        ) : null}

        {s === "QUALITY_CHECK" && can(a, "quality.create") ? (
          <Card>
            <CardHeader><CardTitle>{t("quality.inspect")}</CardTitle></CardHeader>
            <CardContent><QcForm moId={mo.id} checklist={st["production.qcChecklist"]} stages={stages.filter((x) => !x.isQcStage && x.status === "ACTIVE").map((x) => ({ id: x.id, name: locale === "ar" ? x.nameAr : x.nameEn }))} /></CardContent>
          </Card>
        ) : null}

        {mo.qualityChecks.length ? (
          <Card>
            <CardHeader><CardTitle>{t("manufacturing.qualityChecks")}</CardTitle></CardHeader>
            <CardContent className="grid gap-2 text-sm">
              {mo.qualityChecks.map((qc) => (
                <div key={qc.id} className="flex flex-wrap items-center gap-3 border-b pb-2 last:border-0">
                  <Num className="font-medium">{qc.number}</Num><StatusBadge t={t} group="QcResult" value={qc.result} />
                  <span className="text-muted-foreground">{qc.inspector.fullName}</span><Num className="text-muted-foreground">{formatDate(locale, qc.checkDate, true)}</Num>
                  {qc.defects ? <span className="text-destructive">{qc.defects}</span> : null}{qc.notes ? <span>{qc.notes}</span> : null}
                </div>
              ))}
            </CardContent>
          </Card>
        ) : null}

        {variance ? (
          <Card>
            <CardHeader><CardTitle>{t("manufacturing.costs")}</CardTitle></CardHeader>
            <Table>
              <thead><tr className="border-b"><Th /><Th className="text-end">{t("manufacturing.estimated")}</Th><Th className="text-end">{t("manufacturing.actual")}</Th><Th className="text-end">{t("manufacturing.variance")}</Th></tr></thead>
              <tbody>
                {(["material", "labor", "overhead", "other"] as const).map((k) => {
                  const e = Number(variance.estimated[k]);
                  const ac = Number(variance.actual[k]);
                  return <Tr key={k}><Td>{t(`manufacturing.${k}`)}</Td><Td className="num text-end">{q(e)}</Td><Td className="num text-end">{q(ac)}</Td><Td className={`num text-end ${ac - e > 0 ? "text-destructive" : "text-success"}`}>{q(ac - e)}</Td></Tr>;
                })}
                <Tr className="font-semibold"><Td>{t("manufacturing.total")}</Td><Td className="num text-end">{q(variance.estimatedTotal)}</Td><Td className="num text-end">{q(variance.actualTotal)}</Td><Td className="num text-end">{q(variance.variance)}</Td></Tr>
              </tbody>
            </Table>
            <Table>
              <thead><tr className="border-b"><Th>{t("manufacturing.material")}</Th><Th className="text-end">{t("manufacturing.estimated")}</Th><Th className="text-end">{t("manufacturing.actual")}</Th><Th className="text-end">{t("manufacturing.variance")}</Th></tr></thead>
              <tbody>
                {variance.lines.map((l) => (
                  <Tr key={l.materialId}><Td>{l.name} <span className="text-xs text-muted-foreground">({l.unit})</span></Td><Td className="num text-end">{q(l.estimatedQty, 3)}</Td><Td className="num text-end">{q(l.actualQty, 3)}</Td><Td className={`num text-end ${Number(l.qtyVariance) > 0 ? "text-destructive" : ""}`}>{Number(l.qtyVariance) > 0 ? "+" : ""}{q(l.qtyVariance, 3)}</Td></Tr>
                ))}
              </tbody>
            </Table>
          </Card>
        ) : null}

        <AttachmentsPanel entityType="manufacturing_order" entityId={mo.id} canUpload={can(a, "attachments.upload")} canDelete={can(a, "attachments.delete")} categories={["PHOTO", "DRAWING", "DOCUMENT"]} />
      </div>
    </>
  );
}
