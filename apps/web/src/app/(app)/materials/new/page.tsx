import { can, lookups, materials } from "@edge/core";
import { EntityForm } from "@/components/entity-form";
import { Forbidden } from "@/components/forbidden";
import { PageHeader } from "@/components/ui/primitives";
import { getT } from "@/server/i18n";
import { requirePageContext } from "@/server/session";
import { materialFields } from "../fields";

export default async function NewMaterialPage() {
  const ctx = await requirePageContext();
  const { t } = await getT();
  if (!can(ctx.actor, "materials.create")) return <Forbidden t={t} />;
  const [cats, units, sups] = await Promise.all([materials.listMaterialCategories(ctx), materials.listUnits(ctx), lookups.supplierOptions(ctx)]);
  return (
    <>
      <PageHeader title={t("materials.new")} description={t("workflow.materialsInfo")} />
      <EntityForm
        fields={materialFields(cats.filter((c) => c.status === "ACTIVE"), units.filter((u) => u.status === "ACTIVE"), sups)}
        endpoint="/materials"
        method="POST"
        initial={{ status: "ACTIVE", minStock: 0, reorderLevel: 0 }}
        redirectTo="/materials/:id"
      />
    </>
  );
}
