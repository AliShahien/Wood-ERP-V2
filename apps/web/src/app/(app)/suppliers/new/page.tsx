import { can } from "@edge/core";
import { EntityForm } from "@/components/entity-form";
import { Forbidden } from "@/components/forbidden";
import { PageHeader } from "@/components/ui/primitives";
import { getT } from "@/server/i18n";
import { requirePageContext } from "@/server/session";
import { supplierFields } from "../fields";

export default async function NewSupplierPage() {
  const ctx = await requirePageContext();
  const { t } = await getT();
  if (!can(ctx.actor, "suppliers.create")) return <Forbidden t={t} />;
  return (
    <>
      <PageHeader title={t("suppliers.new")} />
      <EntityForm fields={supplierFields} endpoint="/suppliers" method="POST" initial={{ status: "ACTIVE" }} redirectTo="/suppliers/:id" />
    </>
  );
}
