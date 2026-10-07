import { can, lookups, users } from "@edge/core";
import { formatDate } from "@edge/i18n";
import { notFound } from "next/navigation";
import { Forbidden } from "@/components/forbidden";
import { Badge, Card, CardContent, CardHeader, CardTitle, Num, PageHeader, Table, Td, Th, Tr } from "@/components/ui/primitives";
import { getT } from "@/server/i18n";
import { requirePageContext } from "@/server/session";
import { UserForm } from "../user-form";
import { UserActions } from "./user-actions";

export default async function UserPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePageContext();
  const { t, locale } = await getT();
  if (!can(ctx.actor, "users.view")) return <Forbidden t={t} />;
  const { id } = await params;
  const user = await users.getUser(ctx, id).catch(() => null);
  if (!user) notFound();
  const canEdit = can(ctx.actor, "users.edit");
  const [roles, showrooms, warehouses, history] = await Promise.all([
    canEdit ? lookups.roleOptions(ctx) : [],
    canEdit ? lookups.showroomOptions(ctx) : [],
    canEdit ? lookups.warehouseOptions(ctx) : [],
    users.getLoginHistory(ctx, id, { pageSize: 10 }),
  ]);

  return (
    <>
      <PageHeader
        title={user.fullName}
        description={<span className="flex items-center gap-2"><Num>{user.code}</Num><Badge tone={user.status === "ACTIVE" ? "success" : "neutral"}>{t(`status.RecordStatus.${user.status}`)}</Badge></span>}
        actions={
          <UserActions
            userId={user.id}
            status={user.status}
            canDeactivate={can(ctx.actor, "users.deactivate") && user.id !== ctx.actor.userId}
            canReset={can(ctx.actor, "users.reset_password")}
          />
        }
      />
      {canEdit ? (
        <UserForm
          roles={roles}
          showrooms={showrooms}
          warehouses={warehouses}
          initial={{
            id: user.id,
            fullName: user.fullName,
            username: user.username,
            email: user.email,
            phone: user.phone,
            department: user.department,
            showroomId: user.showroomId,
            locale: user.locale,
            roleIds: user.roles.map((r) => r.role.id),
            warehouseIds: user.warehouses.map((w) => w.warehouse.id),
          }}
        />
      ) : null}

      <Card className="mt-6">
        <CardHeader><CardTitle>{t("users.loginHistory")}</CardTitle></CardHeader>
        <Table>
          <thead>
            <tr className="border-b">
              <Th>{t("audit.time")}</Th>
              <Th>{t("common.status")}</Th>
              <Th>{t("users.reason")}</Th>
              <Th>{t("users.ip")}</Th>
            </tr>
          </thead>
          <tbody>
            {history.items.map((h) => (
              <Tr key={h.id}>
                <Td><Num>{formatDate(locale, h.createdAt, true)}</Num></Td>
                <Td><Badge tone={h.success ? "success" : "danger"}>{h.success ? t("users.success") : t("users.failed")}</Badge></Td>
                <Td className="text-muted-foreground">{h.reason ?? "—"}</Td>
                <Td><Num>{h.ip ?? "—"}</Num></Td>
              </Tr>
            ))}
          </tbody>
        </Table>
        {history.items.length === 0 ? <CardContent className="text-sm text-muted-foreground">{t("common.noResults")}</CardContent> : null}
      </Card>
    </>
  );
}
