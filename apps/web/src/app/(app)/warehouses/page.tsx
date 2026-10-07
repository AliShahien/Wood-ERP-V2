import Link from "next/link";
import { Plus } from "@/components/ui/material-icons";
import { can, lookups, warehouses } from "@edge/core";
import { EntityForm } from "@/components/entity-form";
import { Forbidden } from "@/components/forbidden";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, Num, PageHeader, Table, Td, Th, Tr } from "@/components/ui/primitives";
import { getT } from "@/server/i18n";
import { requirePageContext } from "@/server/session";
import { warehouseFields } from "./fields";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t("warehouses.title") };
}

export default async function WarehousesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requirePageContext();
  const { t } = await getT();
  if (!can(ctx.actor, "warehouses.view")) return <Forbidden t={t} />;
  const sp = await searchParams;
  const data = await warehouses.listWarehouses(ctx, { pageSize: 100 });
  const creating = sp.new === "1" && can(ctx.actor, "warehouses.create");
  const managers = creating ? await lookups.userOptions(ctx) : [];
  return (
    <>
      <PageHeader title={t("warehouses.title")} actions={can(ctx.actor, "warehouses.create") && !creating ? <Button asChild><Link href="/warehouses?new=1"><Plus />{t("warehouses.new")}</Link></Button> : null} />
      {creating ? <div className="mb-4"><EntityForm fields={warehouseFields(managers)} endpoint="/warehouses" method="POST" initial={{ status: "ACTIVE", type: "GENERAL" }} redirectTo="/warehouses/:id" /></div> : null}
      <Card>
        <Table>
          <thead><tr className="border-b"><Th>{t("common.code")}</Th><Th>{t("common.name")}</Th><Th>{t("fields.type")}</Th><Th>{t("fields.manager")}</Th><Th>{t("warehouses.itemsInStock")}</Th><Th>{t("common.status")}</Th></tr></thead>
          <tbody>
            {data.items.map((w) => (
              <Tr key={w.id}>
                <Td><Num className="text-muted-foreground">{w.code}</Num></Td>
                <Td><Link href={`/warehouses/${w.id}`} className="font-medium hover:underline">{w.name}</Link></Td>
                <Td>{t(`status.WarehouseType.${w.type}`)}</Td>
                <Td>{w.manager?.fullName ?? "—"}</Td>
                <Td><Num>{w._count.balances}</Num></Td>
                <Td><StatusBadge t={t} group="RecordStatus" value={w.status} /></Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
