import { notFound } from "next/navigation";
import { can, roles } from "@edge/core";
import { Forbidden } from "@/components/forbidden";
import { Card, PageHeader } from "@/components/ui/primitives";
import { getT } from "@/server/i18n";
import { requirePageContext } from "@/server/session";
import { RoleForm } from "../role-form";

export default async function RolePage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePageContext();
  const { t, locale } = await getT();
  if (!can(ctx.actor, "roles.view")) return <Forbidden t={t} />;
  const { id } = await params;
  const role = await roles.getRole(ctx, id).catch(() => null);
  if (!role) notFound();
  const isSuper = role.code === "SUPER_ADMIN";
  const catalog = roles.listPermissionCatalog();
  return (
    <>
      <PageHeader title={locale === "ar" ? role.nameAr : role.nameEn} />
      {isSuper ? <Card className="mb-4 p-4 text-sm text-muted-foreground">{t("roles.superAdminLocked")}</Card> : null}
      <RoleForm
        catalog={catalog}
        readOnly={isSuper || !can(ctx.actor, "roles.edit")}
        canDelete={can(ctx.actor, "roles.delete")}
        initial={{
          id: role.id,
          code: role.code,
          nameAr: role.nameAr,
          nameEn: role.nameEn,
          description: role.description,
          dataScope: role.dataScope,
          permissions: isSuper ? catalog : role.permissions,
          isSystem: role.isSystem,
          usersCount: role._count.users,
        }}
      />
    </>
  );
}
