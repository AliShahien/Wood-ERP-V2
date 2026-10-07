import Link from "next/link";
import { can, customers, plain, products, settings } from "@edge/core";
import { Forbidden } from "@/components/forbidden";
import { PageHeader } from "@/components/ui/primitives";
import { getT } from "@/server/i18n";
import { requirePageContext } from "@/server/session";
import { Button } from "@/components/ui/button";
import { QuotationBuilder } from "../quotation-builder";

export default async function NewQuotationPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requirePageContext();
  const { t } = await getT();
  if (!can(ctx.actor, "quotations.create")) return <Forbidden t={t} />;
  const sp = await searchParams;
  const s = await settings.readSettings(ctx.db);
  const customer = sp.customerId ? await customers.getCustomer(ctx, sp.customerId).catch(() => null) : null;
  const product = sp.productId ? await products.getProduct(ctx, sp.productId).catch(() => null) : null;
  const validUntil = new Date(Date.now() + s["sales.quotationValidityDays"] * 86400_000).toISOString().slice(0, 10);
  const p = product ? plain(product) : null;
  return (
    <>
      <PageHeader title={t("quotations.new")} description={t("workflow.quoteChoice")} actions={<>
        {can(ctx.actor, "customers.create") ? <Button asChild variant="secondary"><Link href="/customers/new">{t("customers.new")}</Link></Button> : null}
        {can(ctx.actor, "measurements.create") ? <Button asChild variant="outline"><Link href="/measurements/new">{t("measurements.new")}</Link></Button> : null}
        {can(ctx.actor, "products.view") ? <Button asChild variant="outline"><Link href="/gallery">{t("nav.gallery")}</Link></Button> : null}
      </>} />
      <QuotationBuilder
        canOverride={can(ctx.actor, "quotations.override_price")}
        initial={{
          customer: customer ? { id: customer.id, label: customer.name, sub: [customer.code, customer.phone].filter(Boolean).join(" · ") } : null,
          lines: [{
            product: p as never,
            width: p?.defaultWidth ? String(p.defaultWidth) : "", height: p?.defaultHeight ? String(p.defaultHeight) : "",
            thickness: p?.defaultThickness ? String(p.defaultThickness) : "", quantity: "1",
            optionIds: p ? p.availableOptions.filter((o) => o.isDefault).map((o) => o.optionId) : [],
            unitPrice: "", overridden: false, discount: "0", description: "", measurementId: sp.measurementId ?? null,
          }],
          discountType: "AMOUNT", discountValue: "0", installationCharge: "0", transportationCharge: "0",
          taxEnabled: s["finance.taxEnabledByDefault"], taxRate: String(s["finance.defaultTaxRate"]), depositRequired: "",
          validUntil, paymentTerms: "", notes: "",
        }}
      />
    </>
  );
}
