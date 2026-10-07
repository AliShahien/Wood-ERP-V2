import Link from "next/link";
import { Plus } from "@/components/ui/material-icons";
import { can, roles } from "@edge/core";
import { Forbidden } from "@/components/forbidden";
import { Button } from "@/components/ui/button";
import { Badge, Card, Num, PageHeader, Table, Td, Th, Tr } from "@/components/ui/primitives";
import { getT } from "@/server/i18n";
import { requirePageContext } from "@/server/session";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t("roles.title") };
}

export default async function RolesPage() {
  const ctx = await requirePageContext();
  const { t, locale } = await getT();
  if (!can(ctx.actor, "roles.view")) return <Forbidden t={t} />;
  const items = await roles.listRoles(ctx);
  return (
    <>
      <PageHeader
        title={t("roles.title")}
        actions={can(ctx.actor, "roles.create") ? <Button asChild><Link href="/roles/new"><Plus />{t("roles.new")}</Link></Button> : null}
      />
      <Card>
        <Table>
          <thead>
            <tr className="border-b">
              <Th>{t("common.code")}</Th>
              <Th>{t("common.name")}</Th>
              <Th>{t("roles.dataScope")}</Th>
              <Th>{t("roles.permissions")}</Th>
              <Th>{t("roles.usersCount")}</Th>
            </tr>
          </thead>
          <tbody>
            {items.map((r) => (
              <Tr key={r.id}>
                <Td><Num className="text-muted-foreground">{r.code}</Num></Td>
                <Td>
                  <Link href={`/roles/${r.id}`} className="font-medium hover:underline">{locale === "ar" ? r.nameAr : r.nameEn}</Link>
                  {r.isSystem ? <Badge className="ms-2">{t("roles.system")}</Badge> : null}
                </Td>
                <Td>{t(`scope.${r.dataScope}`)}</Td>
                <Td><Num>{r.code === "SUPER_ADMIN" ? "∞" : r.permissions.length}</Num></Td>
                <Td><Num>{r._count.users}</Num></Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
