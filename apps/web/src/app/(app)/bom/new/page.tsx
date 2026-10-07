import { notFound } from "next/navigation";
import { can, products } from "@edge/core";
import { Forbidden } from "@/components/forbidden";
import { PageHeader } from "@/components/ui/primitives";
import { getT } from "@/server/i18n";
import { requirePageContext } from "@/server/session";
import { BomEditor } from "../bom-editor";

export default async function NewBomPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requirePageContext();
  const { t } = await getT();
  if (!can(ctx.actor, "bom.create")) return <Forbidden t={t} />;
  const sp = await searchParams;
  const p = sp.productId ? await products.getProduct(ctx, sp.productId).catch(() => null) : null;
  if (!p) notFound();
  return (
    <>
      <PageHeader title={`${t("bom.new")} — ${p.name}`} />
      <BomEditor
        productId={p.id}
        readOnly={false}
        options={p.availableOptions.map((a) => ({ id: a.optionId, name: a.option.name }))}
        defaults={{ width: String(p.defaultWidth ?? 900), height: String(p.defaultHeight ?? 2100), thickness: String(p.defaultThickness ?? "") }}
        initial={{ name: "Standard", laborCostPerUnit: "0", overheadPercent: "10", rules: [{ key: "area", expression: "W * H / 1000000" }], items: [] }}
      />
    </>
  );
}
