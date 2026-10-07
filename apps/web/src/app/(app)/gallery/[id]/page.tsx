import Link from "next/link";
import { notFound } from "next/navigation";
import { can, products } from "@edge/core";
import { formatNumber } from "@edge/i18n";
import { Forbidden } from "@/components/forbidden";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardContent, CardHeader, CardTitle, Num } from "@/components/ui/primitives";
import { getT } from "@/server/i18n";
import { requirePageContext } from "@/server/session";
import { ImageViewer } from "./image-viewer";

export default async function GalleryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePageContext();
  const { t, locale } = await getT();
  if (!can(ctx.actor, "products.view")) return <Forbidden t={t} />;
  const { id } = await params;
  const p = await products.getProduct(ctx, id).catch(() => null);
  if (!p) notFound();
  const groups = new Map<string, typeof p.availableOptions>();
  for (const a of p.availableOptions) groups.set(a.option.type, [...(groups.get(a.option.type) ?? []), a]);
  const range = (a: unknown, b: unknown) => (a || b ? `${a ?? "…"} – ${b ?? "…"}` : "—");

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <ImageViewer images={p.images.map((i) => i.id)} name={p.name} />
      <div className="grid content-start gap-4">
        <div>
          <p className="text-sm text-muted-foreground"><Num>{p.code}</Num> · {p.category.name}</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight" dir="ltr">{p.name}</h1>
          {p.description ? <p className="mt-3 whitespace-pre-line text-muted-foreground">{p.description}</p> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {can(ctx.actor, "quotations.create") ? <Button asChild size="lg"><Link href={`/quotations/new?productId=${p.id}`}>{t("products.createQuotation")}</Link></Button> : null}
          {can(ctx.actor, "measurements.create") ? <Button asChild size="lg" variant="outline"><Link href={`/measurements/new?productId=${p.id}`}>{t("nav.measurements")}</Link></Button> : null}
          {can(ctx.actor, "products.edit") ? <Button asChild size="lg" variant="ghost"><Link href={`/products/${p.id}`}>{t("common.edit")}</Link></Button> : null}
        </div>
        <Card>
          <CardHeader><CardTitle>{t("products.configurations")}</CardTitle></CardHeader>
          <CardContent className="grid gap-3 text-sm">
            <div className="grid grid-cols-2 gap-2">
              <span className="text-muted-foreground">{t("products.sizeRange")} (W)</span><Num>{range(p.minWidth, p.maxWidth)} mm</Num>
              <span className="text-muted-foreground">{t("products.sizeRange")} (H)</span><Num>{range(p.minHeight, p.maxHeight)} mm</Num>
              <span className="text-muted-foreground">{t("products.defaultThickness")}</span><Num>{p.defaultThickness ? `${p.defaultThickness} mm` : "—"}</Num>
              <span className="text-muted-foreground">{t("products.pricingMethod")}</span><span>{t(`status.PricingMethod.${p.pricingMethod}`)}</span>
              {can(ctx.actor, "quotations.create") ? (
                <><span className="text-muted-foreground">{t("products.basePrice")}</span><Num>{formatNumber(locale, Number(p.basePrice))}</Num></>
              ) : null}
            </div>
          </CardContent>
        </Card>
        {[...groups.entries()].map(([type, opts]) => (
          <Card key={type}>
            <CardHeader><CardTitle>{t(`status.OptionType.${type}`)}</CardTitle></CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {opts.map((a) => <Badge key={a.optionId} tone={a.isDefault ? "info" : "neutral"}>{a.option.name}</Badge>)}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
