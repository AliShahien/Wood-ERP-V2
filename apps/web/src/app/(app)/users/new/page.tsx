import { can, lookups } from "@edge/core";
import { Forbidden } from "@/components/forbidden";
import { PageHeader } from "@/components/ui/primitives";
import { getT } from "@/server/i18n";
import { requirePageContext } from "@/server/session";
import { UserForm } from "../user-form";

export default async function NewUserPage() {
  const ctx = await requirePageContext();
  const { t } = await getT();
  if (!can(ctx.actor, "users.create")) return <Forbidden t={t} />;
  const [roles, showrooms, warehouses] = await Promise.all([lookups.roleOptions(ctx), lookups.showroomOptions(ctx), lookups.warehouseOptions(ctx)]);
  return (
    <>
      <PageHeader title={t("users.new")} />
      <UserForm roles={roles} showrooms={showrooms} warehouses={warehouses} />
    </>
  );
}
