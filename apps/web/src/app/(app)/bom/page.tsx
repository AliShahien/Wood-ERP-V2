import Link from "next/link";
import { Plus } from "@/components/ui/material-icons";
import { bom, can, products } from "@edge/core";
import { Forbidden } from "@/components/forbidden";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, NativeSelect, Num, PageHeader, Table, Td, Th, Tr } from "@/components/ui/primitives";
import { getT } from "@/server/i18n";
import { requirePageContext } from "@/server/session";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t("bom.title") };
}

export default async function BomListPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requirePageContext();
  const { t } = await getT();
  if (!can(ctx.actor, "bom.view")) return <Forbidden t={t} />;
  const sp = await searchParams;
  const [rows, prods] = await Promise.all([bom.listBoms(ctx, { productId: sp.productId || undefined }), products.listProducts(ctx, { pageSize: 60, sort: "code" })]);
  return (
    <>
      <PageHeader
        title={t("bom.title")}
        actions={can(ctx.actor, "bom.create") && sp.productId ? <Button asChild><Link href={`/bom/new?productId=${sp.productId}`}><Plus />{t("bom.new")}</Link></Button> : null}
      />
      <Card>
        <form className="flex gap-2 border-b p-3">
          <NativeSelect name="productId" defaultValue={sp.productId ?? ""} className="max-w-sm">
            <option value="">{t("common.all")}</option>
            {prods.items.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
          </NativeSelect>
          <Button type="submit" variant="secondary">{t("common.filter")}</Button>
        </form>
        {rows.length === 0 ? <EmptyState title={t("bom.noBom")} /> : (
          <Table>
            <thead><tr className="border-b"><Th>{t("bom.product")}</Th><Th>{t("bom.version")}</Th><Th>{t("bom.name")}</Th><Th>{t("bom.items")}</Th><Th>{t("nav.manufacturing")}</Th><Th>{t("common.status")}</Th></tr></thead>
            <tbody>
              {rows.map((b) => (
                <Tr key={b.id}>
                  <Td><span dir="ltr">{b.product.name}</span> <Num className="text-xs text-muted-foreground">{b.product.code}</Num></Td>
                  <Td><Link href={`/bom/${b.id}`} className="num font-medium hover:underline">v{b.version}</Link></Td>
                  <Td>{b.name}</Td>
                  <Td><Num>{b._count.items}</Num></Td>
                  <Td><Num>{b._count.mos}</Num></Td>
                  <Td><StatusBadge t={t} group="BomStatus" value={b.status} /></Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
