import { can, purchasing, settings, suppliers, warehouses } from "@edge/core";
import { Forbidden } from "@/components/forbidden";
import { PageHeader } from "@/components/ui/primitives";
import { getT } from "@/server/i18n";
import { requirePageContext } from "@/server/session";
import { PurchaseOrderForm } from "../po-form";

export default async function NewPurchaseOrderPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requirePageContext();
  const { t } = await getT();
  if (!can(ctx.actor, "purchases.create")) return <Forbidden t={t} />;
  const sp = await searchParams;
  const [whs, s, pr, supplier] = await Promise.all([
    warehouses.listWarehouses(ctx, { pageSize: 100, status: "ACTIVE" }).then((r) => r.items),
    settings.readSettings(ctx.db),
    sp.requestId ? purchasing.getPurchaseRequest(ctx, sp.requestId).catch(() => null) : null,
    sp.supplierId ? suppliers.getSupplier(ctx, sp.supplierId).catch(() => null) : null,
  ]);
  return (
    <>
      <PageHeader title={t("purchasing.newOrder")} />
      <PurchaseOrderForm
        warehouses={whs.map((w) => ({ id: w.id, name: w.name }))}
        initial={{
          supplier: supplier ? { id: supplier.id, label: supplier.name, sub: supplier.code } : null,
          warehouseId: whs.find((w) => w.type === "RAW_MATERIALS")?.id ?? whs[0]?.id ?? "", purchaseRequestId: pr?.id ?? null, expectedDate: "",
          taxEnabled: s["finance.taxEnabledByDefault"], taxRate: String(s["finance.defaultTaxRate"]), paymentTerms: "", notes: pr?.notes ?? "",
          lines: pr ? pr.items.map((i) => ({ material: { id: i.material.id, label: i.material.name, sub: i.material.code }, quantity: String(i.quantity), unitPrice: i.material.lastPurchaseCost ? String(i.material.lastPurchaseCost) : "", discount: "0" })) : [],
        }}
      />
    </>
  );
}
