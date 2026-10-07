import { can, inventory } from "@edge/core";
import { MovementsTable } from "@/components/movements-table";
import { Card, CardHeader, CardTitle } from "@/components/ui/primitives";
import { getT } from "@/server/i18n";
import { requirePageContext } from "@/server/session";

/** Latest stock movements of one material (inventory ledger). */
export async function MaterialMovements({ materialId }: { materialId: string }) {
  const ctx = await requirePageContext();
  if (!can(ctx.actor, "inventory.view") && !can(ctx.actor, "materials.view")) return null;
  const { t, locale } = await getT();
  const data = await inventory.stockMovements(ctx, { materialId, pageSize: 25 });
  if (!data.items.length) return null;
  return (
    <Card>
      <CardHeader><CardTitle>{t("inventory.movements")}</CardTitle></CardHeader>
      <MovementsTable t={t} locale={locale} rows={data.items} showMaterial={false} />
    </Card>
  );
}
