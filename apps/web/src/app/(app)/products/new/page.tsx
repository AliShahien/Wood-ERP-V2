import { can, products } from "@edge/core";
import { EntityForm } from "@/components/entity-form";
import { Forbidden } from "@/components/forbidden";
import { PageHeader } from "@/components/ui/primitives";
import { getT } from "@/server/i18n";
import { requirePageContext } from "@/server/session";
import { productFields } from "../fields";

export default async function NewProductPage() {
  const ctx = await requirePageContext();
  const { t } = await getT();
  if (!can(ctx.actor, "products.create")) return <Forbidden t={t} />;
  const cats = (await products.listProductCategories(ctx)).filter((c) => c.status === "ACTIVE");
  return (
    <>
      <PageHeader title={t("products.new")} />
      <EntityForm
        fields={productFields(cats)}
        endpoint="/products"
        method="POST"
        initial={{ status: "DRAFT", pricingMethod: "PER_UNIT", basePrice: 0, defaultWidth: 900, defaultHeight: 2100, defaultThickness: 45 }}
        redirectTo="/products/:id"
      />
    </>
  );
}
