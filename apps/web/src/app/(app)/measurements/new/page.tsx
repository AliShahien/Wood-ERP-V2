import { can, customers, products } from "@edge/core";
import { Forbidden } from "@/components/forbidden";
import { PageHeader } from "@/components/ui/primitives";
import { getT } from "@/server/i18n";
import { requirePageContext } from "@/server/session";
import { MeasurementForm } from "../measurement-form";

export default async function NewMeasurementPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requirePageContext();
  const { t } = await getT();
  if (!can(ctx.actor, "measurements.create")) return <Forbidden t={t} />;
  const sp = await searchParams;
  const c = sp.customerId ? await customers.getCustomer(ctx, sp.customerId).catch(() => null) : null;
  const p = sp.productId ? await products.getProduct(ctx, sp.productId).catch(() => null) : null;
  return (
    <>
      <PageHeader title={t("measurements.new")} />
      <MeasurementForm
        customer={c ? { id: c.id, label: c.name, sub: c.code } : null}
        product={p ? { id: p.id, label: p.name, sub: p.code } : null}
        quotationId={sp.quotationId ?? null}
        initial={{
          width: p?.defaultWidth ? String(p.defaultWidth) : "", height: p?.defaultHeight ? String(p.defaultHeight) : "", thickness: p?.defaultThickness ? String(p.defaultThickness) : "",
          wallThickness: "", openingType: "", openingDirection: "", frameDetails: "", installationNotes: "", notes: "", location: "", room: "",
        }}
      />
    </>
  );
}
