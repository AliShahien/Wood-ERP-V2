import { notFound } from "next/navigation";
import { can, lookups, plain, warehouses } from "@edge/core";
import { ActionButton } from "@/components/action-button";
import { EntityForm } from "@/components/entity-form";
import { Forbidden } from "@/components/forbidden";
import { Badge, Card, CardContent, CardHeader, CardTitle, PageHeader } from "@/components/ui/primitives";
import { getT } from "@/server/i18n";
import { requirePageContext } from "@/server/session";
import { warehouseFields } from "../fields";
import { AddLocation } from "./add-location";

export default async function WarehousePage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePageContext();
  const { t } = await getT();
  if (!can(ctx.actor, "warehouses.view")) return <Forbidden t={t} />;
  const { id } = await params;
  const w = await warehouses.getWarehouse(ctx, id).catch(() => null);
  if (!w) notFound();
  const canEdit = can(ctx.actor, "warehouses.edit");
  const managers = canEdit ? await lookups.userOptions(ctx) : w.manager ? [w.manager] : [];
  return (
    <>
      <PageHeader title={w.name} actions={can(ctx.actor, "warehouses.delete") ? <ActionButton endpoint={`/warehouses/${w.id}`} method="DELETE" label="common.delete" variant="destructive" redirectTo="/warehouses" /> : null} />
      <div className="grid gap-4">
        <EntityForm fields={warehouseFields(managers)} endpoint={`/warehouses/${w.id}`} method="PATCH" isEdit readOnly={!canEdit} initial={plain(w) as unknown as Record<string, unknown>} />
        <Card>
          <CardHeader><CardTitle>{t("warehouses.locations")}</CardTitle></CardHeader>
          <CardContent className="grid gap-3">
            <div className="flex flex-wrap gap-2">
              {w.locations.length === 0 ? <p className="text-sm text-muted-foreground">{t("common.noResults")}</p> : w.locations.map((l) => <Badge key={l.id}><span className="num">{l.code}</span>&nbsp;· {l.name}</Badge>)}
            </div>
            {canEdit ? <AddLocation warehouseId={w.id} /> : null}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
