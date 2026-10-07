import { can, expenses } from "@edge/core";
import { Forbidden } from "@/components/forbidden";
import { SimpleCrud } from "@/components/simple-crud";
import { StatusBadge } from "@/components/status-badge";
import { Num } from "@/components/ui/primitives";
import { getT } from "@/server/i18n";
import { requirePageContext } from "@/server/session";

export default async function ExpenseCategoriesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requirePageContext();
  const { t } = await getT();
  if (!can(ctx.actor, "expenses.create")) return <Forbidden t={t} />;
  const sp = await searchParams;
  const rows = await expenses.listCategories(ctx);
  return (
    <SimpleCrud
      t={t} sp={sp} title={t("expenses.categories")} newLabel={t("expenses.newCategory")} basePath="/expense-categories" endpoint="/expense-categories" rows={rows}
      canCreate canEdit defaults={{ status: "ACTIVE" }}
      fields={[
        { name: "code", label: "common.code", required: true, dir: "ltr", disabledOnEdit: true },
        { name: "name", label: "common.name", required: true },
        { name: "isProductionCost", label: "expenses.isProductionCost", type: "checkbox" },
        { name: "status", label: "common.status", type: "select", required: true, options: [{ value: "ACTIVE", label: "status.RecordStatus.ACTIVE" }, { value: "INACTIVE", label: "status.RecordStatus.INACTIVE" }] },
      ]}
      columns={[
        { header: t("common.code"), cell: (r) => <Num className="text-muted-foreground">{r.code}</Num> },
        { header: t("common.name"), cell: (r) => <span className="font-medium">{r.name}</span> },
        { header: t("expenses.isProductionCost"), cell: (r) => (r.isProductionCost ? t("common.yes") : t("common.no")) },
        { header: t("common.status"), cell: (r) => <StatusBadge t={t} group="RecordStatus" value={r.status} /> },
      ]}
    />
  );
}
