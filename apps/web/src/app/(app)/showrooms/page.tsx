import Link from "next/link";
import { Plus } from "@/components/ui/material-icons";
import { can, lookups, showrooms } from "@edge/core";
import { EntityForm } from "@/components/entity-form";
import { Forbidden } from "@/components/forbidden";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, Num, PageHeader, Table, Td, Th, Tr } from "@/components/ui/primitives";
import { getT } from "@/server/i18n";
import { requirePageContext } from "@/server/session";
import { showroomFields } from "./fields";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t("showrooms.title") };
}

export default async function ShowroomsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requirePageContext();
  const { t } = await getT();
  if (!can(ctx.actor, "showrooms.view")) return <Forbidden t={t} />;
  const sp = await searchParams;
  const data = await showrooms.listShowrooms(ctx, { pageSize: 100 });
  const creating = sp.new === "1" && can(ctx.actor, "showrooms.create");
  const managers = creating ? await lookups.userOptions(ctx) : [];
  return (
    <>
      <PageHeader title={t("showrooms.title")} actions={can(ctx.actor, "showrooms.create") && !creating ? <Button asChild><Link href="/showrooms?new=1"><Plus />{t("showrooms.new")}</Link></Button> : null} />
      {creating ? <div className="mb-4"><EntityForm fields={showroomFields(managers)} endpoint="/showrooms" method="POST" initial={{ status: "ACTIVE" }} redirectTo="/showrooms/:id" /></div> : null}
      <Card>
        <Table>
          <thead><tr className="border-b"><Th>{t("common.code")}</Th><Th>{t("common.name")}</Th><Th>{t("fields.manager")}</Th><Th>{t("fields.phone")}</Th><Th>{t("showrooms.users")}</Th><Th>{t("showrooms.customers")}</Th><Th>{t("common.status")}</Th></tr></thead>
          <tbody>
            {data.items.map((s) => (
              <Tr key={s.id}>
                <Td><Num className="text-muted-foreground">{s.code}</Num></Td>
                <Td><Link href={`/showrooms/${s.id}`} className="font-medium hover:underline">{s.name}</Link></Td>
                <Td>{s.manager?.fullName ?? "—"}</Td>
                <Td><Num>{s.phone ?? "—"}</Num></Td>
                <Td><Num>{s._count.users}</Num></Td>
                <Td><Num>{s._count.customers}</Num></Td>
                <Td><StatusBadge t={t} group="RecordStatus" value={s.status} /></Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
