import { can, purchasing, settings, suppliers } from "@edge/core";
import { Forbidden } from "@/components/forbidden";
import { PageHeader } from "@/components/ui/primitives";
import { getT } from "@/server/i18n";
import { requirePageContext } from "@/server/session";
import { SupplierInvoiceForm } from "../si-form";

export default async function NewSupplierInvoicePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requirePageContext();
  const { t } = await getT();
  if (!can(ctx.actor, "supplier_invoices.create")) return <Forbidden t={t} />;
  const sp = await searchParams;
  const s = await settings.readSettings(ctx.db);
  const draft = sp.poId ? await purchasing.invoiceDraftFromPo(ctx, sp.poId).catch(() => null) : null;
  const supplier = draft ? await suppliers.getSupplier(ctx, draft.supplierId).catch(() => null) : null;
  return (
    <>
      <PageHeader title={t("purchasing.newSupplierInvoice")} />
      <SupplierInvoiceForm
        initial={{
          supplier: supplier ? { id: supplier.id, label: supplier.name, sub: supplier.code } : null,
          purchaseOrderId: draft?.purchaseOrderId ?? null,
          taxEnabled: draft?.taxEnabled ?? s["finance.taxEnabledByDefault"],
          taxRate: String(draft?.taxRate ?? s["finance.defaultTaxRate"]),
          lines: (draft?.items ?? []).map((i) => ({ materialId: i.materialId, description: i.description, quantity: String(i.quantity), unitPrice: String(i.unitPrice), discount: String(i.discount) })),
        }}
      />
    </>
  );
}
