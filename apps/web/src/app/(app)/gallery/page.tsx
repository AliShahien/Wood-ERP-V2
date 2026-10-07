import Link from "next/link";
import { DoorOpen, Search } from "@/components/ui/material-icons";
import { can, products } from "@edge/core";
import { Forbidden } from "@/components/forbidden";
import { Pagination } from "@/components/pagination";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, Input, NativeSelect, Num, PageHeader } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import { getT } from "@/server/i18n";
import { requirePageContext } from "@/server/session";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t("products.gallery") };
}

export default async function GalleryPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requirePageContext();
  const { t } = await getT();
  if (!can(ctx.actor, "products.view")) return <Forbidden t={t} />;
  const sp = await searchParams;
  const sort = (["name", "newest", "code"] as const).find((s) => s === sp.sort) ?? "newest";
  const [data, cats] = await Promise.all([
    products.listProducts(ctx, { page: sp.page, q: sp.q, categoryId: sp.categoryId || undefined, status: "ACTIVE", sort, pageSize: 24 }),
    products.listProductCategories(ctx),
  ]);
  const canQuote = can(ctx.actor, "quotations.create");
  const chip = (id?: string) => {
    const params = new URLSearchParams(Object.entries({ ...sp, categoryId: id, page: undefined }).filter(([, v]) => v) as [string, string][]);
    return `/gallery?${params}`;
  };
  return (
    <>
      <PageHeader title={t("products.gallery")} />
      <form className="mb-4 flex flex-wrap gap-2" role="search">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute start-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input name="q" defaultValue={sp.q} placeholder={t("common.searchPlaceholder")} className="ps-8" />
        </div>
        {sp.categoryId ? <input type="hidden" name="categoryId" value={sp.categoryId} /> : null}
        <NativeSelect name="sort" defaultValue={sort} className="w-36">
          <option value="newest">{t("products.sortNewest")}</option>
          <option value="name">{t("products.sortName")}</option>
          <option value="code">{t("products.sortCode")}</option>
        </NativeSelect>
        <Button type="submit" variant="secondary">{t("common.search")}</Button>
      </form>
      <div className="mb-5 flex flex-wrap gap-2">
        <Link href={chip(undefined)} className={cn("rounded-full border px-3 py-1 text-sm", !sp.categoryId && "border-primary bg-primary text-primary-foreground")}>{t("common.all")}</Link>
        {cats.filter((c) => c.status === "ACTIVE").map((c) => (
          <Link key={c.id} href={chip(c.id)} className={cn("rounded-full border px-3 py-1 text-sm", sp.categoryId === c.id && "border-primary bg-primary text-primary-foreground")}>{c.name}</Link>
        ))}
      </div>
      {data.items.length === 0 ? (
        <Card><EmptyState title={t("common.noResults")} hint={t("common.noResultsHint")} /></Card>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {data.items.map((p) => (
            <Card key={p.id} className="group flex flex-col overflow-hidden">
              <Link href={`/gallery/${p.id}`} className="relative block aspect-[3/4] bg-muted">
                {p.mainImageId ? (
                  <img src={`/api/v1/product-images/${p.mainImageId}`} alt={p.name} loading="lazy" decoding="async" className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
                ) : (
                  <div className="grid size-full place-items-center text-muted-foreground"><DoorOpen className="size-10 opacity-40" /></div>
                )}
              </Link>
              <div className="flex flex-1 flex-col gap-1 p-3">
                <div className="flex items-center justify-between gap-2">
                  <Num className="text-xs text-muted-foreground">{p.code}</Num>
                  <StatusBadge t={t} group="ProductStatus" value={p.status} />
                </div>
                <p className="font-semibold leading-tight" dir="ltr">{p.name}</p>
                <p className="text-xs text-muted-foreground">{p.category.name}</p>
                <div className="mt-auto flex gap-2 pt-2">
                  <Button asChild size="sm" variant="outline" className="flex-1"><Link href={`/gallery/${p.id}`}>{t("products.view")}</Link></Button>
                  {canQuote ? <Button asChild size="sm" className="flex-1"><Link href={`/quotations/new?productId=${p.id}`}>{t("products.select")}</Link></Button> : null}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
      <Card className="mt-4">
        <Pagination t={t} page={data.page} pageCount={data.pageCount} total={data.total} searchParams={sp} basePath="/gallery" />
      </Card>
    </>
  );
}
