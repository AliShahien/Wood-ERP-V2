import Link from "next/link";
import { notFound } from "next/navigation";
import { can, plain, purchasing, suppliers } from "@edge/core";
import { LedgerStatement } from "@/components/ledger-statement";
import { formatNumber } from "@edge/i18n";
import { ActionButton } from "@/components/action-button";
import { AttachmentsPanel } from "@/components/attachments-panel";
import { EntityForm } from "@/components/entity-form";
import { Forbidden } from "@/components/forbidden";
import { StatusBadge } from "@/components/status-badge";
import { Badge, Card, CardContent, CardHeader, CardTitle, Num, PageHeader } from "@/components/ui/primitives";
import { getT } from "@/server/i18n";
import { requirePageContext } from "@/server/session";
import { Button } from "@/components/ui/button";
import { supplierFields } from "../fields";

export default async function SupplierPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePageContext();
  const { t, locale } = await getT();
  if (!can(ctx.actor, "suppliers.view")) return <Forbidden t={t} />;
  const { id } = await params;
  const s = await suppliers.getSupplier(ctx, id).catch(() => null);
  if (!s) notFound();
  const stats = [
    ["suppliers.purchaseOrders", s._count.purchaseOrders], ["suppliers.goodsReceipts", s._count.goodsReceipts],
    ["suppliers.invoices", s._count.invoices], ["suppliers.payments", s._count.payments],
  ] as const;
  return (
    <>
      <PageHeader
        title={s.name}
        description={<span className="flex items-center gap-2"><Num>{s.code}</Num><StatusBadge t={t} group="RecordStatus" value={s.status} /></span>}
        actions={<>
          {can(ctx.actor, "purchases.create") ? <Button asChild><Link href={`/purchase-orders/new?supplierId=${s.id}`}>{t("purchasing.newOrder")}</Link></Button> : null}
          {can(ctx.actor, "suppliers.delete") ? <ActionButton endpoint={`/suppliers/${s.id}`} method="DELETE" label="common.delete" variant="destructive" redirectTo="/suppliers" /> : null}
        </>}
      />
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {s.balance !== null ? (
          <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">{t("suppliers.payable")}</p><p className="num mt-1 text-lg font-semibold">{formatNumber(locale, s.balance)}</p></CardContent></Card>
        ) : null}
        {stats.map(([k, n]) => (
          <Card key={k}><CardContent className="pt-4"><p className="text-xs text-muted-foreground">{t(k)}</p><p className="num mt-1 text-lg font-semibold">{n}</p></CardContent></Card>
        ))}
      </div>
      <div className="grid gap-4">
        <EntityForm fields={supplierFields} endpoint={`/suppliers/${s.id}`} method="PATCH" isEdit readOnly={!can(ctx.actor, "suppliers.edit")} initial={plain(s) as unknown as Record<string, unknown>} />
        <Card>
          <CardHeader><CardTitle>{t("suppliers.materials")}</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {s.materials.length === 0 ? <p className="text-sm text-muted-foreground">{t("common.noResults")}</p> : s.materials.map((m) => (
              <Link key={m.id} href={`/materials/${m.id}`}><Badge>{m.name}</Badge></Link>
            ))}
          </CardContent>
        </Card>
        {can(ctx.actor, "supplier_payments.view") ? <LedgerStatement t={t} locale={locale} title={t("reports.statement")} rows={await purchasing.supplierStatement(ctx, s.id)} /> : null}
        <AttachmentsPanel entityType="supplier" entityId={s.id} canUpload={can(ctx.actor, "attachments.upload")} canDelete={can(ctx.actor, "attachments.delete")} />
      </div>
    </>
  );
}
