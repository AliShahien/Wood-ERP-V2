import { notFound, redirect } from "next/navigation";
import { can, plain, products, quotations } from "@edge/core";
import { Forbidden } from "@/components/forbidden";
import { PageHeader } from "@/components/ui/primitives";
import { getT } from "@/server/i18n";
import { requirePageContext } from "@/server/session";
import { QuotationBuilder } from "../../quotation-builder";

export default async function EditQuotationPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePageContext();
  const { t } = await getT();
  if (!can(ctx.actor, "quotations.edit")) return <Forbidden t={t} />;
  const { id } = await params;
  const q = await quotations.getQuotation(ctx, id).catch(() => null);
  if (!q) notFound();
  if (q.status !== "DRAFT") redirect(`/quotations/${id}`);
  const productInfos = await Promise.all([...new Set(q.items.map((i) => i.productId))].map((pid) => products.getProduct(ctx, pid).then(plain)));
  const byId = new Map(productInfos.map((p) => [p.id, p]));
  return (
    <>
      <PageHeader title={`${t("common.edit")} ${q.number}`} />
      <QuotationBuilder
        canOverride={can(ctx.actor, "quotations.override_price")}
        initial={{
          id: q.id,
          customer: { id: q.customer.id, label: q.customer.name, sub: q.customer.code },
          lines: q.items.map((i) => ({
            product: byId.get(i.productId) as never,
            width: String(i.width), height: String(i.height), thickness: i.thickness ? String(i.thickness) : "", quantity: String(i.quantity),
            optionIds: i.options.map((o) => o.optionId), unitPrice: String(i.unitPrice), overridden: false, discount: String(i.discount),
            description: i.description ?? "", measurementId: i.measurementId,
          })),
          discountType: q.discountType, discountValue: String(q.discountValue), installationCharge: String(q.installationCharge),
          transportationCharge: String(q.transportationCharge), taxEnabled: q.taxEnabled, taxRate: String(q.taxRate),
          depositRequired: String(q.depositRequired), validUntil: q.validUntil.toISOString().slice(0, 10), paymentTerms: q.paymentTerms ?? "", notes: q.notes ?? "",
        }}
      />
    </>
  );
}
