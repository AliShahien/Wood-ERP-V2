import { can, products } from "@edge/core";
import { formatNumber } from "@edge/i18n";
import { Forbidden } from "@/components/forbidden";
import { SimpleCrud } from "@/components/simple-crud";
import { StatusBadge } from "@/components/status-badge";
import { Num } from "@/components/ui/primitives";
import { getT } from "@/server/i18n";
import { requirePageContext } from "@/server/session";

const TYPES = ["MATERIAL", "FINISH", "COLOR", "ACCESSORY", "OTHER"];
const METHODS = ["FIXED_PER_UNIT", "PER_SQM", "PERCENT"];

export default async function ProductOptionsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requirePageContext();
  const { t, locale } = await getT();
  if (!can(ctx.actor, "products.view")) return <Forbidden t={t} />;
  const sp = await searchParams;
  const rows = await products.listOptions(ctx);
  return (
    <SimpleCrud
      t={t}
      sp={sp}
      title={t("products.optionsCatalog")}
      newLabel={t("products.newOption")}
      basePath="/products/options"
      endpoint="/product-options"
      rows={rows}
      canCreate={can(ctx.actor, "products.create")}
      canEdit={can(ctx.actor, "products.edit")}
      defaults={{ status: "ACTIVE", type: "FINISH", priceMethod: "FIXED_PER_UNIT", priceAdjustment: 0, sortOrder: 0 }}
      fields={[
        { name: "code", label: "common.code", required: true, dir: "ltr", disabledOnEdit: true },
        { name: "type", label: "fields.type", type: "select", required: true, options: TYPES.map((v) => ({ value: v, label: `status.OptionType.${v}` })) },
        { name: "name", label: "common.name", required: true },
        { name: "priceMethod", label: "products.priceMethod", type: "select", required: true, options: METHODS.map((v) => ({ value: v, label: `status.PriceAdjustmentMethod.${v}` })) },
        { name: "priceAdjustment", label: "products.priceAdjustment", type: "number" },
        { name: "sortOrder", label: "fields.sortOrder", type: "number" },
        { name: "status", label: "common.status", type: "select", required: true, options: [{ value: "ACTIVE", label: "status.RecordStatus.ACTIVE" }, { value: "INACTIVE", label: "status.RecordStatus.INACTIVE" }] },
      ]}
      columns={[
        { header: t("common.code"), cell: (r) => <Num className="text-muted-foreground">{r.code}</Num> },
        { header: t("fields.type"), cell: (r) => t(`status.OptionType.${r.type}`) },
        { header: t("common.name"), cell: (r) => <span className="font-medium">{r.name}</span> },
        { header: t("products.priceMethod"), cell: (r) => t(`status.PriceAdjustmentMethod.${r.priceMethod}`) },
        { header: t("products.priceAdjustment"), className: "text-end", cell: (r) => <Num>{formatNumber(locale, Number(r.priceAdjustment))}{r.priceMethod === "PERCENT" ? "%" : ""}</Num> },
        { header: t("common.status"), cell: (r) => <StatusBadge t={t} group="RecordStatus" value={r.status} /> },
      ]}
    />
  );
}
