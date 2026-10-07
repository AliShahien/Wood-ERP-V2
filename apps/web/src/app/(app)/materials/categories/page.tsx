import { can, materials } from "@edge/core";
import { Forbidden } from "@/components/forbidden";
import { SimpleCrud } from "@/components/simple-crud";
import { StatusBadge } from "@/components/status-badge";
import { Num } from "@/components/ui/primitives";
import { getT } from "@/server/i18n";
import { requirePageContext } from "@/server/session";

const COST = ["RAW_MATERIAL", "ACCESSORY", "PAINT", "OTHER"];

export default async function MaterialCategoriesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requirePageContext();
  const { t } = await getT();
  if (!can(ctx.actor, "materials.view")) return <Forbidden t={t} />;
  const sp = await searchParams;
  const rows = await materials.listMaterialCategories(ctx);
  return (
    <SimpleCrud
      t={t}
      sp={sp}
      title={t("materials.categories")}
      newLabel={t("materials.newCategory")}
      basePath="/materials/categories"
      endpoint="/material-categories"
      rows={rows}
      canCreate={can(ctx.actor, "materials.create")}
      canEdit={can(ctx.actor, "materials.edit")}
      defaults={{ status: "ACTIVE", costCategory: "RAW_MATERIAL" }}
      fields={[
        { name: "code", label: "common.code", required: true, dir: "ltr", disabledOnEdit: true },
        { name: "name", label: "common.name", required: true, dir: "rtl" },
        { name: "costCategory", label: "materials.costCategory", type: "select", required: true, options: COST.map((v) => ({ value: v, label: `status.CostCategory.${v}` })) },
        { name: "parentId", label: "fields.parent", type: "select", emptyOption: "fields.none", options: rows.map((r) => ({ value: r.id, label: r.name, raw: true })) },
        { name: "status", label: "common.status", type: "select", required: true, options: [{ value: "ACTIVE", label: "status.RecordStatus.ACTIVE" }, { value: "INACTIVE", label: "status.RecordStatus.INACTIVE" }] },
      ]}
      columns={[
        { header: t("common.code"), cell: (r) => <Num className="text-muted-foreground">{r.code}</Num> },
        { header: t("common.name"), cell: (r) => <span className="font-medium">{r.name}</span> },
        { header: t("materials.costCategory"), cell: (r) => t(`status.CostCategory.${r.costCategory}`) },
        { header: t("nav.materials"), cell: (r) => <Num>{r._count.materials}</Num> },
        { header: t("common.status"), cell: (r) => <StatusBadge t={t} group="RecordStatus" value={r.status} /> },
      ]}
    />
  );
}
