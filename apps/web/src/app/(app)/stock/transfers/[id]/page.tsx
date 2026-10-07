import { notFound } from "next/navigation";
import { can, inventory } from "@edge/core";
import { formatDate, formatNumber } from "@edge/i18n";
import { ActionButton } from "@/components/action-button";
import { Forbidden } from "@/components/forbidden";
import { StatusBadge } from "@/components/status-badge";
import { Card, Num, PageHeader, Table, Td, Th, Tr } from "@/components/ui/primitives";
import { getT } from "@/server/i18n";
import { requirePageContext } from "@/server/session";

export default async function TransferPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePageContext();
  const { t, locale } = await getT();
  if (!can(ctx.actor, "inventory.view")) return <Forbidden t={t} />;
  const { id } = await params;
  const tr = await inventory.getTransfer(ctx, id).catch(() => null);
  if (!tr) notFound();
  return (
    <>
      <PageHeader
        title={`${t("inventory.transfers")} ${tr.number}`}
        description={<span className="flex items-center gap-2"><StatusBadge t={t} group="DocStatus" value={tr.status} />{tr.fromWarehouse.name} → {tr.toWarehouse.name} · <Num>{formatDate(locale, tr.transferDate)}</Num></span>}
        actions={tr.status === "DRAFT" && can(ctx.actor, "inventory.transfer") ? <ActionButton endpoint={`/stock-transfers/${tr.id}/post`} label="inventory.post" variant="default" /> : null}
      />
      <Card>
        <Table>
          <thead><tr className="border-b"><Th>{t("common.code")}</Th><Th>{t("docs.material")}</Th><Th>{t("fields.unit")}</Th><Th className="text-end">{t("docs.qty")}</Th></tr></thead>
          <tbody>
            {tr.items.map((i) => (
              <Tr key={i.id}><Td><Num className="text-muted-foreground">{i.material.code}</Num></Td><Td>{i.material.name}</Td><Td>{i.material.unit.name}</Td><Td className="text-end"><Num>{formatNumber(locale, Number(i.quantity), 3)}</Num></Td></Tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
