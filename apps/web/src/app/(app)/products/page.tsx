import Link from "next/link";
import { Plus } from "@/components/ui/material-icons";
import { can, products } from "@edge/core";
import { formatNumber } from "@edge/i18n";
import { Forbidden } from "@/components/forbidden";
import { ListToolbar } from "@/components/list-toolbar";
import { Pagination } from "@/components/pagination";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, Num, PageHeader, Table, Td, Th, Tr } from "@/components/ui/primitives";
import { getT } from "@/server/i18n";
import { requirePageContext } from "@/server/session";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t("products.title") };
}

export default async function ProductsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requirePageContext();
  const { t, locale } = await getT();
  if (!can(ctx.actor, "products.view")) return <Forbidden t={t} />;
  const sp = await searchParams;
  const [data, cats] = await Promise.all([
    products.listProducts(ctx, { page: sp.page, q: sp.q, categoryId: sp.categoryId || undefined, status: sp.status || undefined, sort: "code", pageSize: 30 }),
    products.listProductCategories(ctx),
  ]);
  return (
    <>
      <PageHeader title={t("products.title")} actions={<>
        {can(ctx.actor, "products.create") ? <Button asChild><Link href="/products/new"><Plus />{t("products.new")}</Link></Button> : null}
        {can(ctx.actor, "products.view") ? <Button asChild variant="outline"><Link href="/products/categories">{t("nav.productCategories")}</Link></Button> : null}
        {can(ctx.actor, "products.view") ? <Button asChild variant="outline"><Link href="/products/options">{t("nav.productOptions")}</Link></Button> : null}
      </>} />
      <Card>
        <ListToolbar t={t} sp={sp} filters={[
          { name: "categoryId", options: cats.map((c) => ({ value: c.id, label: c.name })) },
          { name: "status", options: ["DRAFT", "ACTIVE", "INACTIVE"].map((v) => ({ value: v, label: t(`status.ProductStatus.${v}`) })) },
        ]} />
        {data.items.length === 0 ? <EmptyState title={t("common.noResults")} /> : (
          <Table>
            <thead><tr className="border-b">
              <Th /><Th>{t("common.code")}</Th><Th>{t("common.name")}</Th><Th>{t("fields.category")}</Th><Th>{t("products.pricingMethod")}</Th><Th className="text-end">{t("products.basePrice")}</Th><Th>{t("common.status")}</Th>
            </tr></thead>
            <tbody>
              {data.items.map((p) => (
                <Tr key={p.id}>
                  <Td className="w-14">
                    {p.mainImageId ? <img src={`/api/v1/product-images/${p.mainImageId}`} alt="" className="size-10 rounded object-cover" loading="lazy" /> : <div className="size-10 rounded bg-muted" />}
                  </Td>
                  <Td><Num className="text-muted-foreground">{p.code}</Num></Td>
                  <Td><Link href={`/products/${p.id}`} className="font-medium hover:underline" dir="ltr">{p.name}</Link></Td>
                  <Td>{p.category.name}</Td>
                  <Td>{t(`status.PricingMethod.${p.pricingMethod}`)}</Td>
                  <Td className="text-end"><Num>{formatNumber(locale, Number(p.basePrice))}</Num></Td>
                  <Td><StatusBadge t={t} group="ProductStatus" value={p.status} /></Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
        <Pagination t={t} page={data.page} pageCount={data.pageCount} total={data.total} searchParams={sp} basePath="/products" />
      </Card>
    </>
  );
}
