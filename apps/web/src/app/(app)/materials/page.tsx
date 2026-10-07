import Link from "next/link";
import { Plus } from "@/components/ui/material-icons";
import { can, materials } from "@edge/core";
import { formatNumber } from "@edge/i18n";
import { Forbidden } from "@/components/forbidden";
import { ListToolbar, statusFilter } from "@/components/list-toolbar";
import { Pagination } from "@/components/pagination";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Badge, Card, Checkbox, EmptyState, Num, PageHeader, Table, Td, Th, Tr } from "@/components/ui/primitives";
import { getT } from "@/server/i18n";
import { requirePageContext } from "@/server/session";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t("materials.title") };
}

export default async function MaterialsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requirePageContext();
  const { t, locale } = await getT();
  if (!can(ctx.actor, "materials.view")) return <Forbidden t={t} />;
  const sp = await searchParams;
  const [data, cats] = await Promise.all([
    materials.listMaterials(ctx, { page: sp.page, q: sp.q, status: sp.status || undefined, categoryId: sp.categoryId || undefined, lowStock: sp.lowStock === "1" ? "1" : undefined }),
    materials.listMaterialCategories(ctx),
  ]);
  const showCost = can(ctx.actor, "costing.view");
  return (
    <>
      <PageHeader title={t("materials.title")} description={t("workflow.materialsInfo")} actions={<>
        {can(ctx.actor, "materials.create") ? <Button asChild><Link href="/materials/new"><Plus />{t("materials.new")}</Link></Button> : null}
        {can(ctx.actor, "materials.view") ? <Button asChild variant="outline"><Link href="/materials/categories">{t("nav.materialCategories")}</Link></Button> : null}
        {can(ctx.actor, "materials.view") ? <Button asChild variant="outline"><Link href="/units">{t("nav.units")}</Link></Button> : null}
      </>} />
      <Card>
        <ListToolbar t={t} sp={sp} filters={[{ name: "categoryId", options: cats.map((c) => ({ value: c.id, label: c.name })) }, statusFilter(t)]}>
          <label className="flex items-center gap-2 px-2 text-sm"><Checkbox name="lowStock" value="1" defaultChecked={sp.lowStock === "1"} />{t("materials.lowStock")}</label>
        </ListToolbar>
        {data.items.length === 0 ? <EmptyState title={t("common.noResults")} hint={t("common.noResultsHint")} /> : (
          <Table>
            <thead><tr className="border-b">
              <Th>{t("common.code")}</Th><Th>{t("materials.name")}</Th><Th>{t("fields.category")}</Th><Th>{t("fields.unit")}</Th>
              <Th className="text-end">{t("materials.onHand")}</Th><Th className="text-end">{t("materials.reorderLevel")}</Th>
              {showCost ? <Th className="text-end">{t("materials.averageCost")}</Th> : null}
              <Th>{t("common.status")}</Th>
            </tr></thead>
            <tbody>
              {data.items.map((m) => {
                const low = m.onHand <= Number(m.reorderLevel);
                return (
                  <Tr key={m.id}>
                    <Td><Num className="text-muted-foreground">{m.code}</Num></Td>
                    <Td><Link href={`/materials/${m.id}`} className="font-medium hover:underline" dir="rtl">{m.name}</Link></Td>
                    <Td>{m.category.name}</Td>
                    <Td>{m.unit.name}</Td>
                    <Td className="text-end"><Num className={low ? "font-semibold text-destructive" : ""}>{formatNumber(locale, m.onHand, 2)}</Num>{low ? <Badge tone="danger" className="ms-2">!</Badge> : null}</Td>
                    <Td className="text-end"><Num>{formatNumber(locale, Number(m.reorderLevel), 2)}</Num></Td>
                    {showCost ? <Td className="text-end"><Num>{formatNumber(locale, Number((m as { averageCost?: unknown }).averageCost ?? 0), 2)}</Num></Td> : null}
                    <Td><StatusBadge t={t} group="RecordStatus" value={m.status} /></Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}
        <Pagination t={t} page={data.page} pageCount={data.pageCount} total={data.total} searchParams={sp} basePath="/materials" />
      </Card>
    </>
  );
}
