import { notFound } from "next/navigation";
import { can, inventory } from "@edge/core";
import { formatDate, formatNumber } from "@edge/i18n";
import { ActionButton } from "@/components/action-button";
import { Forbidden } from "@/components/forbidden";
import { StatusBadge } from "@/components/status-badge";
import { Card, Num, PageHeader, Table, Td, Th, Tr } from "@/components/ui/primitives";
import { getT } from "@/server/i18n";
import { requirePageContext } from "@/server/session";

export default async function AdjustmentPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePageContext();
  const { t, locale } = await getT();
  if (!can(ctx.actor, "inventory.view")) return <Forbidden t={t} />;
  const { id } = await params;
  const a = await inventory.getAdjustment(ctx, id).catch(() => null);
  if (!a) notFound();
  const canAdjust = can(ctx.actor, "inventory.adjust");
  return (
    <>
      <PageHeader
        title={`${t(a.isOpening ? "inventory.opening" : "inventory.adjustments")} ${a.number}`}
        description={<span className="flex items-center gap-2"><StatusBadge t={t} group="DocStatus" value={a.status} />{a.warehouse.name} · {a.reason} · <Num>{formatDate(locale, a.adjustmentDate)}</Num></span>}
        actions={
          <>
            {a.status === "DRAFT" && canAdjust ? <ActionButton endpoint={`/stock-adjustments/${a.id}/post`} label="inventory.post" variant="default" /> : null}
            {a.status === "POSTED" && canAdjust ? <ActionButton endpoint={`/stock-adjustments/${a.id}/reverse`} label="inventory.reverse" variant="destructive" prompt="quotations.reasonPrompt" /> : null}
          </>
        }
      />
      <Card>
        <Table>
          <thead><tr className="border-b"><Th>{t("common.code")}</Th><Th>{t("docs.material")}</Th><Th>{t("fields.unit")}</Th><Th className="text-end">{t("inventory.quantityChange")}</Th><Th className="text-end">{t("inventory.unitCost")}</Th></tr></thead>
          <tbody>
            {a.items.map((i) => (
              <Tr key={i.id}>
                <Td><Num className="text-muted-foreground">{i.material.code}</Num></Td><Td>{i.material.name}</Td><Td>{i.material.unit.name}</Td>
                <Td className="text-end"><Num className={Number(i.quantityChange) < 0 ? "text-destructive" : "text-success"}>{formatNumber(locale, Number(i.quantityChange), 3)}</Num></Td>
                <Td className="text-end"><Num>{i.unitCost ? formatNumber(locale, Number(i.unitCost), 4) : "—"}</Num></Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
