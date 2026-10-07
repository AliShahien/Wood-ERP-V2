import { can, products } from "@edge/core";
import { Forbidden } from "@/components/forbidden";
import { SimpleCrud } from "@/components/simple-crud";
import { StatusBadge } from "@/components/status-badge";
import { Num } from "@/components/ui/primitives";
import { getT } from "@/server/i18n";
import { requirePageContext } from "@/server/session";

export default async function ProductCategoriesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requirePageContext();
  const { t } = await getT();
  if (!can(ctx.actor, "products.view")) return <Forbidden t={t} />;
  const sp = await searchParams;
  const rows = await products.listProductCategories(ctx);
  return (
    <SimpleCrud
      t={t}
      sp={sp}
      title={t("products.categories")}
      newLabel={t("products.newCategory")}
      basePath="/products/categories"
      endpoint="/product-categories"
      rows={rows}
      canCreate={can(ctx.actor, "products.create")}
      canEdit={can(ctx.actor, "products.edit")}
      defaults={{ status: "ACTIVE", sortOrder: 0 }}
      fields={[
        { name: "code", label: "common.code", required: true, dir: "ltr", disabledOnEdit: true },
        { name: "name", label: "common.name", required: true },
        { name: "sortOrder", label: "fields.sortOrder", type: "number" },
        { name: "parentId", label: "fields.parent", type: "select", emptyOption: "fields.none", options: rows.map((r) => ({ value: r.id, label: r.name, raw: true })) },
        { name: "status", label: "common.status", type: "select", required: true, options: [{ value: "ACTIVE", label: "status.RecordStatus.ACTIVE" }, { value: "INACTIVE", label: "status.RecordStatus.INACTIVE" }] },
      ]}
      columns={[
        { header: t("common.code"), cell: (r) => <Num className="text-muted-foreground">{r.code}</Num> },
        { header: t("common.name"), cell: (r) => <span className="font-medium">{r.name}</span> },
        { header: t("nav.products"), cell: (r) => <Num>{r._count.products}</Num> },
        { header: t("fields.sortOrder"), cell: (r) => <Num>{r.sortOrder}</Num> },
        { header: t("common.status"), cell: (r) => <StatusBadge t={t} group="RecordStatus" value={r.status} /> },
      ]}
    />
  );
}
