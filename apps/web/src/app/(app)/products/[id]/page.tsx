import Link from "next/link";
import { notFound } from "next/navigation";
import { can, plain, products } from "@edge/core";
import { ActionButton } from "@/components/action-button";
import { AttachmentsPanel } from "@/components/attachments-panel";
import { EntityForm } from "@/components/entity-form";
import { Forbidden } from "@/components/forbidden";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, Num, PageHeader } from "@/components/ui/primitives";
import { getT } from "@/server/i18n";
import { requirePageContext } from "@/server/session";
import { productFields } from "../fields";
import { ImageManager } from "./image-manager";
import { OptionsEditor } from "./options-editor";

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePageContext();
  const { t } = await getT();
  if (!can(ctx.actor, "products.view")) return <Forbidden t={t} />;
  const { id } = await params;
  const p = await products.getProduct(ctx, id).catch(() => null);
  if (!p) notFound();
  const canEdit = can(ctx.actor, "products.edit");
  const [cats, allOptions] = await Promise.all([products.listProductCategories(ctx), canEdit ? products.listOptions(ctx, { status: "ACTIVE" }) : Promise.resolve([])]);
  return (
    <>
      <PageHeader
        title={p.name}
        description={<span className="flex items-center gap-2"><Num>{p.code}</Num><StatusBadge t={t} group="ProductStatus" value={p.status} /></span>}
        actions={
          <>
            <Button asChild variant="outline"><Link href={`/gallery/${p.id}`}>{t("products.view")}</Link></Button>
            {can(ctx.actor, "bom.view") ? <Button asChild variant="outline"><Link href={`/bom?productId=${p.id}`}>{t("products.bom")}</Link></Button> : null}
            {can(ctx.actor, "products.delete") ? <ActionButton endpoint={`/products/${p.id}`} method="DELETE" label="common.delete" variant="destructive" redirectTo="/products" /> : null}
          </>
        }
      />
      <div className="grid gap-4">
        <Card>
          <CardHeader><CardTitle>{t("products.images")}</CardTitle></CardHeader>
          <CardContent><ImageManager productId={p.id} images={p.images} canEdit={canEdit} /></CardContent>
        </Card>
        <EntityForm fields={productFields(cats)} endpoint={`/products/${p.id}`} method="PATCH" isEdit readOnly={!canEdit} initial={plain(p) as unknown as Record<string, unknown>} />
        {canEdit ? (
          <Card>
            <CardHeader><CardTitle>{t("products.options")}</CardTitle></CardHeader>
            <CardContent>
              <OptionsEditor
                productId={p.id}
                all={plain(allOptions).map((o) => ({ id: o.id, type: o.type, name: o.name, priceMethod: o.priceMethod, priceAdjustment: String(o.priceAdjustment) }))}
                selected={p.availableOptions.map((a) => ({ optionId: a.optionId, priceOverride: a.priceOverride === null ? null : String(a.priceOverride), isDefault: a.isDefault }))}
              />
            </CardContent>
          </Card>
        ) : null}
        <AttachmentsPanel entityType="product" entityId={p.id} canUpload={can(ctx.actor, "attachments.upload")} canDelete={can(ctx.actor, "attachments.delete")} />
      </div>
    </>
  );
}
