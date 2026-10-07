import Link from "next/link";
import { notFound } from "next/navigation";
import { can, purchasing } from "@edge/core";
import { formatNumber } from "@edge/i18n";
import { ActionButton } from "@/components/action-button";
import { Forbidden } from "@/components/forbidden";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, Num, PageHeader, Table, Td, Th, Tr } from "@/components/ui/primitives";
import { getT } from "@/server/i18n";
import { requirePageContext } from "@/server/session";

export default async function PurchaseRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePageContext();
  const { t, locale } = await getT();
  if (!can(ctx.actor, "purchases.view")) return <Forbidden t={t} />;
  const { id } = await params;
  const pr = await purchasing.getPurchaseRequest(ctx, id).catch(() => null);
  if (!pr) notFound();
  const a = ctx.actor;
  const s = pr.status;
  return (
    <>
      <PageHeader
        title={`${t("purchasing.requests")} ${pr.number}`}
        description={<span className="flex items-center gap-2"><StatusBadge t={t} group="PurchaseRequestStatus" value={s} />{pr.reason}</span>}
        actions={
          <>
            {s === "DRAFT" && can(a, "purchases.create") ? <ActionButton endpoint={`/purchase-requests/${pr.id}/submit`} label="purchasing.submit" variant="default" /> : null}
            {s === "SUBMITTED" && can(a, "purchases.approve") ? <><ActionButton endpoint={`/purchase-requests/${pr.id}/approve`} label="purchasing.approve" variant="default" /><ActionButton endpoint={`/purchase-requests/${pr.id}/reject`} label="purchasing.reject" variant="destructive" /></> : null}
            {s === "APPROVED" && can(a, "purchases.create") ? <Button asChild><Link href={`/purchase-orders/new?requestId=${pr.id}`}>{t("purchasing.createOrder")}</Link></Button> : null}
            {["DRAFT", "SUBMITTED", "APPROVED"].includes(s) && can(a, "purchases.cancel") ? <ActionButton endpoint={`/purchase-requests/${pr.id}/cancel`} label="purchasing.cancel" variant="ghost" /> : null}
          </>
        }
      />
      <Card>
        <Table>
          <thead><tr className="border-b"><Th>{t("common.code")}</Th><Th>{t("docs.material")}</Th><Th className="text-end">{t("docs.qty")}</Th><Th>{t("fields.unit")}</Th></tr></thead>
          <tbody>
            {pr.items.map((i) => <Tr key={i.id}><Td><Num className="text-muted-foreground">{i.material.code}</Num></Td><Td>{i.material.name}</Td><Td className="text-end"><Num>{formatNumber(locale, Number(i.quantity), 3)}</Num></Td><Td>{i.material.unit.name}</Td></Tr>)}
          </tbody>
        </Table>
      </Card>
      {pr.purchaseOrders.length ? <p className="mt-3 text-sm">{pr.purchaseOrders.map((po) => <Link key={po.id} href={`/purchase-orders/${po.id}`} className="num me-3 text-primary hover:underline">{po.number}</Link>)}</p> : null}
    </>
  );
}
