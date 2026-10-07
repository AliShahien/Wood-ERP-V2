import Link from "next/link";
import { notFound } from "next/navigation";
import { can, purchasing, warehouses } from "@edge/core";
import { formatDate, formatNumber } from "@edge/i18n";
import { ActionButton } from "@/components/action-button";
import { AttachmentsPanel } from "@/components/attachments-panel";
import { DocLinks } from "@/components/doc-links";
import { Forbidden } from "@/components/forbidden";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, Num, PageHeader, Table, Td, Th, Tr } from "@/components/ui/primitives";
import { getT } from "@/server/i18n";
import { requirePageContext } from "@/server/session";
import { PurchaseOrderForm } from "../po-form";

export default async function PurchaseOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePageContext();
  const { t, locale } = await getT();
  if (!can(ctx.actor, "purchases.view")) return <Forbidden t={t} />;
  const { id } = await params;
  const po = await purchasing.getPurchaseOrder(ctx, id).catch(() => null);
  if (!po) notFound();
  const a = ctx.actor;
  const s = po.status;
  const f = (v: unknown, d = 2) => formatNumber(locale, Number(v ?? 0), d);
  const editable = s === "DRAFT" && can(a, "purchases.create");
  const whs = editable ? (await warehouses.listWarehouses(ctx, { pageSize: 100, status: "ACTIVE" })).items : [];
  return (
    <>
      <PageHeader
        title={`${t("docs.purchaseOrder")} ${po.number}`}
        description={<span className="flex items-center gap-2"><StatusBadge t={t} group="PurchaseOrderStatus" value={s} /><Link href={`/suppliers/${po.supplier.id}`} className="hover:underline">{po.supplier.name}</Link> · {po.warehouse.name}</span>}
        actions={
          <>
            <DocLinks t={t} type="purchase_order" id={po.id} />
            {s === "DRAFT" && can(a, "purchases.create") ? <ActionButton endpoint={`/purchase-orders/${po.id}/submit`} label="purchasing.submit" variant="default" /> : null}
            {s === "SUBMITTED" && can(a, "purchases.approve") ? <><ActionButton endpoint={`/purchase-orders/${po.id}/approve`} label="purchasing.approve" variant="default" /><ActionButton endpoint={`/purchase-orders/${po.id}/return`} label="purchasing.returnToDraft" /></> : null}
            {["APPROVED", "PARTIALLY_RECEIVED"].includes(s) && can(a, "goods_receipts.create") ? <ActionButton endpoint="/goods-receipts" body={{ purchaseOrderId: po.id }} label="purchasing.receive" variant="default" redirectTo="/goods-receipts/:id" confirmKey={null} /> : null}
            {["PARTIALLY_RECEIVED", "RECEIVED"].includes(s) && can(a, "supplier_invoices.create") ? <Button asChild variant="outline"><Link href={`/supplier-invoices/new?poId=${po.id}`}>{t("purchasing.createInvoice")}</Link></Button> : null}
            {["PARTIALLY_RECEIVED", "RECEIVED"].includes(s) && can(a, "purchases.approve") ? <ActionButton endpoint={`/purchase-orders/${po.id}/close`} label="purchasing.close" variant="ghost" /> : null}
            {["DRAFT", "SUBMITTED", "APPROVED"].includes(s) && can(a, "purchases.cancel") ? <ActionButton endpoint={`/purchase-orders/${po.id}/cancel`} label="purchasing.cancel" variant="ghost" prompt="quotations.reasonPrompt" /> : null}
          </>
        }
      />
      {editable ? (
        <PurchaseOrderForm
          warehouses={whs.map((w) => ({ id: w.id, name: w.name }))}
          initial={{
            id: po.id, supplier: { id: po.supplier.id, label: po.supplier.name, sub: po.supplier.code }, warehouseId: po.warehouseId,
            expectedDate: po.expectedDate ? po.expectedDate.toISOString().slice(0, 10) : "", taxEnabled: po.taxEnabled, taxRate: String(po.taxRate),
            paymentTerms: po.paymentTerms ?? "", notes: po.notes ?? "",
            lines: po.items.map((i) => ({ material: { id: i.material.id, label: i.material.name, sub: i.material.code }, quantity: String(i.quantity), unitPrice: String(i.unitPrice), discount: String(i.discount) })),
          }}
        />
      ) : (
        <div className="grid gap-4">
          <Card>
            <Table>
              <thead><tr className="border-b"><Th>#</Th><Th>{t("docs.material")}</Th><Th className="text-end">{t("purchasing.ordered")}</Th><Th className="text-end">{t("purchasing.received")}</Th><Th className="text-end">{t("purchasing.unitPrice")}</Th><Th className="text-end">{t("docs.discount")}</Th><Th className="text-end">{t("docs.lineTotal")}</Th></tr></thead>
              <tbody>
                {po.items.map((i) => (
                  <Tr key={i.id}>
                    <Td><Num>{i.lineNo}</Num></Td><Td>{i.material.name} <Num className="text-xs text-muted-foreground">{i.material.code}</Num></Td>
                    <Td className="text-end"><Num>{f(i.quantity, 3)} {i.material.unit.name}</Num></Td>
                    <Td className="text-end"><Num className={Number(i.receivedQuantity) >= Number(i.quantity) ? "text-success" : ""}>{f(i.receivedQuantity, 3)}</Num></Td>
                    <Td className="text-end"><Num>{f(i.unitPrice)}</Num></Td><Td className="text-end"><Num>{f(i.discount)}</Num></Td><Td className="text-end"><Num>{f(i.lineTotal)}</Num></Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
            <CardContent className="pt-4">
              <dl className="ms-auto grid w-64 grid-cols-2 gap-1 text-sm">
                <dt className="text-muted-foreground">{t("docs.subtotal")}</dt><dd className="num text-end">{f(po.subtotal)}</dd>
                {po.taxEnabled ? <><dt className="text-muted-foreground">{t("docs.tax")} (<Num>{Number(po.taxRate)}%</Num>)</dt><dd className="num text-end">{f(po.taxTotal)}</dd></> : null}
                <dt className="font-semibold">{t("docs.total")}</dt><dd className="num text-end font-semibold">{f(po.total)} {po.currency}</dd>
              </dl>
            </CardContent>
          </Card>
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>{t("purchasing.receipts")}</CardTitle></CardHeader>
              <CardContent className="grid gap-1 text-sm">
                {po.goodsReceipts.length === 0 ? <p className="text-muted-foreground">{t("common.noResults")}</p> : po.goodsReceipts.map((g) => (
                  <Link key={g.id} href={`/goods-receipts/${g.id}`} className="flex justify-between hover:underline"><Num>{g.number}</Num><Num>{formatDate(locale, g.receiptDate)}</Num><span>{t(`status.DocStatus.${g.status}`)}</span></Link>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>{t("purchasing.supplierInvoices")}</CardTitle></CardHeader>
              <CardContent className="grid gap-1 text-sm">
                {po.supplierInvoices.length === 0 ? <p className="text-muted-foreground">{t("common.noResults")}</p> : po.supplierInvoices.map((i) => (
                  <Link key={i.id} href={`/supplier-invoices/${i.id}`} className="flex justify-between hover:underline"><Num>{i.number}</Num><Num>{f(i.total)}</Num><span>{t(`status.InvoiceStatus.${i.status}`)}</span></Link>
                ))}
              </CardContent>
            </Card>
          </div>
          <AttachmentsPanel entityType="purchase_order" entityId={po.id} canUpload={can(a, "attachments.upload")} canDelete={can(a, "attachments.delete")} />
        </div>
      )}
    </>
  );
}
