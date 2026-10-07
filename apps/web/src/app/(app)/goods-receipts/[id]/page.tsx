import Link from "next/link";
import { notFound } from "next/navigation";
import { can, purchasing } from "@edge/core";
import { formatDate, formatNumber } from "@edge/i18n";
import { ActionButton } from "@/components/action-button";
import { AttachmentsPanel } from "@/components/attachments-panel";
import { DocLinks } from "@/components/doc-links";
import { Forbidden } from "@/components/forbidden";
import { StatusBadge } from "@/components/status-badge";
import { Card, Num, PageHeader, Table, Td, Th, Tr } from "@/components/ui/primitives";
import { getT } from "@/server/i18n";
import { requirePageContext } from "@/server/session";

export default async function GoodsReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePageContext();
  const { t, locale } = await getT();
  if (!can(ctx.actor, "goods_receipts.view")) return <Forbidden t={t} />;
  const { id } = await params;
  const gr = await purchasing.getGoodsReceipt(ctx, id).catch(() => null);
  if (!gr) notFound();
  const a = ctx.actor;
  const showCost = gr.items.some((i) => i.unitCost !== null);
  return (
    <>
      <PageHeader
        title={`${t("docs.goodsReceipt")} ${gr.number}`}
        description={<span className="flex flex-wrap items-center gap-2"><StatusBadge t={t} group="DocStatus" value={gr.status} />{gr.supplier.name} · {gr.warehouse.name} · <Num>{formatDate(locale, gr.receiptDate)}</Num>{gr.purchaseOrder ? <Link href={`/purchase-orders/${gr.purchaseOrder.id}`} className="num hover:underline">{gr.purchaseOrder.number}</Link> : null}</span>}
        actions={
          <>
            <DocLinks t={t} type="goods_receipt" id={gr.id} />
            {gr.status === "DRAFT" && can(a, "goods_receipts.post") ? <ActionButton endpoint={`/goods-receipts/${gr.id}/post`} label="purchasing.post" variant="default" /> : null}
            {gr.status === "POSTED" && can(a, "goods_receipts.reverse") ? <ActionButton endpoint={`/goods-receipts/${gr.id}/reverse`} label="purchasing.reverse" variant="destructive" prompt="quotations.reasonPrompt" /> : null}
          </>
        }
      />
      <div className="grid gap-4">
        <Card>
          <Table>
            <thead><tr className="border-b"><Th>{t("common.code")}</Th><Th>{t("docs.material")}</Th><Th className="text-end">{t("docs.qty")}</Th><Th>{t("fields.unit")}</Th>{showCost ? <><Th className="text-end">{t("inventory.unitCost")}</Th><Th className="text-end">{t("docs.lineTotal")}</Th></> : null}</tr></thead>
            <tbody>
              {gr.items.map((i) => (
                <Tr key={i.id}>
                  <Td><Num className="text-muted-foreground">{i.material.code}</Num></Td><Td>{i.material.name}</Td>
                  <Td className="text-end"><Num>{formatNumber(locale, Number(i.quantity), 3)}</Num></Td><Td>{i.material.unit.name}</Td>
                  {showCost ? <><Td className="text-end"><Num>{formatNumber(locale, Number(i.unitCost), 4)}</Num></Td><Td className="text-end"><Num>{formatNumber(locale, Number(i.lineTotal))}</Num></Td></> : null}
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>
        {gr.reverseReason ? <p className="text-sm text-destructive">{gr.reverseReason}</p> : null}
        <AttachmentsPanel entityType="goods_receipt" entityId={gr.id} canUpload={can(a, "attachments.upload")} canDelete={can(a, "attachments.delete")} />
      </div>
    </>
  );
}
