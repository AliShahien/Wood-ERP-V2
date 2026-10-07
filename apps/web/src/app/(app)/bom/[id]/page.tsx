import Link from "next/link";
import { notFound } from "next/navigation";
import { bom, can, products } from "@edge/core";
import { ActionButton } from "@/components/action-button";
import { Forbidden } from "@/components/forbidden";
import { StatusBadge } from "@/components/status-badge";
import { Card, PageHeader } from "@/components/ui/primitives";
import { getT } from "@/server/i18n";
import { requirePageContext } from "@/server/session";
import { BomEditor } from "../bom-editor";

export default async function BomPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePageContext();
  const { t } = await getT();
  if (!can(ctx.actor, "bom.view")) return <Forbidden t={t} />;
  const { id } = await params;
  const b = await bom.getBom(ctx, id).catch(() => null);
  if (!b) notFound();
  const p = await products.getProduct(ctx, b.productId);
  const a = ctx.actor;
  const editable = b.status === "DRAFT" && can(a, "bom.edit");
  return (
    <>
      <PageHeader
        title={`${t("bom.title")} — ${b.product.name} v${b.version}`}
        description={<span className="flex items-center gap-2"><StatusBadge t={t} group="BomStatus" value={b.status} /><Link href={`/products/${b.product.id}`} className="num hover:underline">{b.product.code}</Link></span>}
        actions={
          <>
            {b.status === "DRAFT" && can(a, "bom.activate") ? <ActionButton endpoint={`/boms/${b.id}/activate`} label="bom.activate" variant="default" /> : null}
            {can(a, "bom.create") ? <ActionButton endpoint={`/boms/${b.id}/copy`} label="bom.copy" redirectTo="/bom/:id" confirmKey={null} /> : null}
            {b.status !== "ARCHIVED" && can(a, "bom.activate") ? <ActionButton endpoint={`/boms/${b.id}/archive`} label="bom.archive" variant="ghost" /> : null}
          </>
        }
      />
      {!editable ? <Card className="mb-4 p-3 text-sm text-muted-foreground">{t("bom.lockedHint")}</Card> : null}
      <BomEditor
        bomId={b.id}
        productId={b.productId}
        readOnly={!editable}
        options={p.availableOptions.map((o) => ({ id: o.optionId, name: o.option.name }))}
        defaults={{ width: String(p.defaultWidth ?? 900), height: String(p.defaultHeight ?? 2100), thickness: String(p.defaultThickness ?? "") }}
        initial={{
          name: b.name, laborCostPerUnit: String(b.laborCostPerUnit ?? 0), overheadPercent: String(b.overheadPercent),
          rules: b.rules.map((r) => ({ key: r.key, expression: r.expression })),
          items: b.items.map((i) => ({
            material: { id: i.material.id, label: i.material.name, sub: i.material.code }, quantityType: i.quantityType,
            fixedQuantity: i.fixedQuantity ? String(i.fixedQuantity) : "", formula: i.formula ?? "", perUnit: i.perUnit,
            wastePercent: String(i.wastePercent), conditionOptionId: i.conditionOptionId ?? "",
          })),
        }}
      />
    </>
  );
}
