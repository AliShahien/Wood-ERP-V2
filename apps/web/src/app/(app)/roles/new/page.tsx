import { can, roles } from "@edge/core";
import { Forbidden } from "@/components/forbidden";
import { PageHeader } from "@/components/ui/primitives";
import { getT } from "@/server/i18n";
import { requirePageContext } from "@/server/session";
import { RoleForm } from "../role-form";

export default async function NewRolePage() {
  const ctx = await requirePageContext();
  const { t } = await getT();
  if (!can(ctx.actor, "roles.create")) return <Forbidden t={t} />;
  return (
    <>
      <PageHeader title={t("roles.new")} />
      <RoleForm catalog={roles.listPermissionCatalog()} readOnly={false} canDelete={false} />
    </>
  );
}
