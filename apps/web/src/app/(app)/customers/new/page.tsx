import { can, lookups } from "@edge/core";
import { EntityForm } from "@/components/entity-form";
import { Forbidden } from "@/components/forbidden";
import { PageHeader } from "@/components/ui/primitives";
import { getT } from "@/server/i18n";
import { requirePageContext } from "@/server/session";
import { customerFields } from "../fields";

export default async function NewCustomerPage() {
  const ctx = await requirePageContext();
  const { t } = await getT();
  if (!can(ctx.actor, "customers.create")) return <Forbidden t={t} />;
  const pickShowroom = ctx.actor.isSuperAdmin || ctx.actor.dataScope === "ALL";
  const showrooms = pickShowroom ? await lookups.showroomOptions(ctx) : [];
  return (
    <>
      <PageHeader title={t("customers.new")} />
      <EntityForm
        fields={customerFields(showrooms, pickShowroom)}
        endpoint="/customers"
        method="POST"
        initial={{ status: "ACTIVE", showroomId: ctx.actor.showroomId }}
        redirectTo="/customers/:id"
      />
    </>
  );
}
