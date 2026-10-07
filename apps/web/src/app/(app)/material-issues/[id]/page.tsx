import Link from "next/link";
import { notFound } from "next/navigation";
import { can, manufacturing } from "@edge/core";
import { formatDate, formatNumber } from "@edge/i18n";
import { ActionButton } from "@/components/action-button";
import { DocLinks } from "@/components/doc-links";
import { Forbidden } from "@/components/forbidden";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, Num, PageHeader, Table, Td, Th, Tr } from "@/components/ui/primitives";
import { getT } from "@/server/i18n";
import { requirePageContext } from "@/server/session";

export default async function MaterialIssuePage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePageContext();
  const { t, locale } = await getT();
  if (!can(ctx.actor, "material_issues.view")) return <Forbidden t={t} />;
  const { id } = await params;
  const mi = await manufacturing.getMaterialIssue(ctx, id).catch(() => null);
  if (!mi) notFound();
  const showCost = can(ctx.actor, "costing.view");
  return (
    <>
      <PageHeader
        title={`${t(mi.type === "ISSUE" ? "docs.materialIssue" : "docs.materialReturn")} ${mi.number}`}
        description={<span className="flex items-center gap-2"><StatusBadge t={t} group="DocStatus" value={mi.status} /><Link href={`/manufacturing/${mi.manufacturingOrder.id}`} className="num hover:underline">{mi.manufacturingOrder.number}</Link> · {mi.warehouse.name} · <Num>{formatDate(locale, mi.issueDate)}</Num></span>}
        actions={
          <>
            <DocLinks t={t} type="material_issue" id={mi.id} />
            {mi.status === "DRAFT" && can(ctx.actor, "material_issues.post") ? <ActionButton endpoint={`/material-issues/${mi.id}/post`} label="materialIssues.post" variant="default" /> : null}
            {mi.status === "POSTED" && can(ctx.actor, "material_issues.reverse") ? <ActionButton endpoint={`/material-issues/${mi.id}/reverse`} label="materialIssues.reverse" variant="destructive" prompt="quotations.reasonPrompt" /> : null}
          </>
        }
      />
      <Card>
        <Table>
          <thead><tr className="border-b"><Th>{t("common.code")}</Th><Th>{t("docs.material")}</Th><Th>{t("fields.unit")}</Th><Th className="text-end">{t("docs.qty")}</Th>{showCost ? <><Th className="text-end">{t("inventory.unitCost")}</Th><Th className="text-end">{t("docs.lineTotal")}</Th></> : null}</tr></thead>
          <tbody>
            {mi.items.map((i) => (
              <Tr key={i.id}>
                <Td><Num className="text-muted-foreground">{i.material.code}</Num></Td><Td>{i.material.name}</Td><Td>{i.material.unit.name}</Td>
                <Td className="text-end"><Num>{formatNumber(locale, Number(i.quantity), 3)}</Num></Td>
                {showCost ? <><Td className="text-end"><Num>{i.unitCost ? formatNumber(locale, Number(i.unitCost), 4) : "—"}</Num></Td><Td className="text-end"><Num>{i.totalCost ? formatNumber(locale, Number(i.totalCost)) : "—"}</Num></Td></> : null}
              </Tr>
            ))}
          </tbody>
        </Table>
        {mi.notes || mi.reverseReason ? <CardContent className="pt-4 text-sm">{mi.notes}{mi.reverseReason ? <p className="text-destructive">{mi.reverseReason}</p> : null}</CardContent> : null}
      </Card>
    </>
  );
}
