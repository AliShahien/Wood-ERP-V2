import { can, type ServiceContext } from "../context";
import { AppError } from "../errors";
import { readSettings } from "./settings";
import * as quotations from "./quotations";
import * as salesOrders from "./sales-orders";
import * as receivables from "./receivables";
import * as manufacturing from "./manufacturing";
import * as purchasing from "./purchasing";
import * as deliveries from "./deliveries";

/**
 * Printable document model. Labels are i18n keys; values are already-formatted strings or numbers.
 * The web layer renders it to HTML (and PDF through Chromium) in the user's language.
 */
export interface DocModel {
  titleKey: string;
  number: string;
  date: Date;
  company: { name: string; address: string; phone: string; email: string; taxNumber: string };
  party?: { labelKey: string; name: string; lines: string[] };
  meta: { labelKey: string; value: string | number | Date | null }[];
  columns: { key: string; labelKey: string; align?: "start" | "end"; kind?: "money" | "qty" | "text" | "ltr" }[];
  rows: Record<string, string | number | null>[];
  totals: { labelKey: string; value: number; strong?: boolean }[];
  notes?: string | null;
  signatures: string[];
  currency: string;
}

async function company(ctx: ServiceContext) {
  const s = await readSettings(ctx.db);
  return { name: s["company.name"], address: s["company.address"], phone: s["company.phone"], email: s["company.email"], taxNumber: s["company.taxNumber"] };
}

const n = (v: unknown) => Number(v ?? 0);

export async function buildDocument(ctx: ServiceContext, type: string, id: string): Promise<DocModel> {
  switch (type) {
    case "quotation": {
      const q = await quotations.getQuotation(ctx, id);
      return {
        titleKey: "docs.quotation", number: q.number, date: q.quotationDate, company: await company(ctx), currency: q.currency,
        party: { labelKey: "docs.customer", name: q.customer.name, lines: [q.customer.phone, q.customer.address, q.customer.city].filter(Boolean) as string[] },
        meta: [
          { labelKey: "docs.validUntil", value: q.validUntil },
          { labelKey: "fields.showroom", value: q.showroom.name },
          { labelKey: "docs.salesperson", value: q.salesperson.fullName },
          { labelKey: "common.status", value: `status.QuotationStatus.${q.status}` },
        ],
        columns: [
          { key: "no", labelKey: "docs.no", kind: "text" }, { key: "item", labelKey: "docs.item" }, { key: "size", labelKey: "docs.size", kind: "ltr" },
          { key: "qty", labelKey: "docs.qty", align: "end", kind: "qty" }, { key: "price", labelKey: "docs.unitPrice", align: "end", kind: "money" },
          { key: "discount", labelKey: "docs.discount", align: "end", kind: "money" }, { key: "total", labelKey: "docs.lineTotal", align: "end", kind: "money" },
        ],
        rows: q.items.map((i) => ({
          no: i.lineNo,
          item: `${i.product.name} (${i.product.code})${i.options.length ? ` — ${i.options.map((o) => o.name).join("، ")}` : ""}${i.description ? `\n${i.description}` : ""}`,
          size: `${n(i.width)} × ${n(i.height)}${i.thickness ? ` × ${n(i.thickness)}` : ""} mm`,
          qty: n(i.quantity), price: n(i.unitPrice), discount: n(i.discount), total: n(i.lineTotal),
        })),
        totals: [
          { labelKey: "docs.subtotal", value: n(q.subtotal) },
          ...(n(q.discountTotal) ? [{ labelKey: "docs.discount", value: -n(q.discountTotal) }] : []),
          ...(n(q.installationCharge) ? [{ labelKey: "docs.installation", value: n(q.installationCharge) }] : []),
          ...(n(q.transportationCharge) ? [{ labelKey: "docs.transportation", value: n(q.transportationCharge) }] : []),
          ...(q.taxEnabled ? [{ labelKey: "docs.tax", value: n(q.taxTotal) }] : []),
          { labelKey: "docs.total", value: n(q.total), strong: true },
          ...(n(q.depositRequired) ? [{ labelKey: "docs.deposit", value: n(q.depositRequired) }] : []),
        ],
        notes: [q.paymentTerms, q.notes].filter(Boolean).join("\n\n") || null,
        signatures: ["docs.signCustomer", "docs.signCompany"],
      };
    }
    case "sales_order": {
      const so = await salesOrders.getSalesOrder(ctx, id);
      const showMoney = can(ctx.actor, "quotations.view") || can(ctx.actor, "invoices.view");
      return {
        titleKey: "docs.salesOrder", number: so.number, date: so.orderDate, company: await company(ctx), currency: so.currency,
        party: { labelKey: "docs.customer", name: so.customer.name, lines: [so.customer.phone, so.deliveryAddress].filter(Boolean) as string[] },
        meta: [
          { labelKey: "docs.quotationRef", value: so.quotation.number },
          { labelKey: "docs.requiredDate", value: so.requiredDate },
          { labelKey: "fields.showroom", value: so.showroom.name },
          { labelKey: "common.status", value: `status.SalesOrderStatus.${so.status}` },
        ],
        columns: [
          { key: "no", labelKey: "docs.no" }, { key: "item", labelKey: "docs.item" }, { key: "size", labelKey: "docs.size", kind: "ltr" },
          { key: "qty", labelKey: "docs.qty", align: "end", kind: "qty" },
          ...(showMoney ? [{ key: "total", labelKey: "docs.lineTotal", align: "end" as const, kind: "money" as const }] : []),
        ],
        rows: so.items.map((i) => ({
          no: i.lineNo,
          item: `${i.product.name} (${i.product.code})${i.quotationItem.options.length ? ` — ${i.quotationItem.options.map((o) => o.name).join("، ")}` : ""}`,
          size: `${n(i.quotationItem.width)} × ${n(i.quotationItem.height)}${i.quotationItem.thickness ? ` × ${n(i.quotationItem.thickness)}` : ""} mm`,
          qty: n(i.quantity), total: n(i.quotationItem.lineTotal),
        })),
        totals: showMoney ? [{ labelKey: "docs.total", value: n(so.total), strong: true }] : [],
        notes: so.notes,
        signatures: ["docs.signCustomer", "docs.signCompany"],
      };
    }
    case "invoice": {
      const inv = await receivables.getInvoice(ctx, id);
      return {
        titleKey: "docs.invoice", number: inv.number, date: inv.invoiceDate, company: await company(ctx), currency: inv.currency,
        party: { labelKey: "docs.customer", name: inv.customer.name, lines: [inv.customer.phone, inv.customer.address, inv.customer.taxNumber ? `Tax: ${inv.customer.taxNumber}` : null].filter(Boolean) as string[] },
        meta: [
          { labelKey: "docs.salesOrderRef", value: inv.salesOrder?.number ?? null },
          { labelKey: "docs.dueDate", value: inv.dueDate },
          { labelKey: "common.status", value: `status.InvoiceStatus.${inv.status}` },
        ],
        columns: [
          { key: "no", labelKey: "docs.no" }, { key: "item", labelKey: "docs.item" },
          { key: "qty", labelKey: "docs.qty", align: "end", kind: "qty" }, { key: "price", labelKey: "docs.unitPrice", align: "end", kind: "money" },
          { key: "discount", labelKey: "docs.discount", align: "end", kind: "money" }, { key: "total", labelKey: "docs.lineTotal", align: "end", kind: "money" },
        ],
        rows: inv.items.map((i) => ({ no: i.lineNo, item: i.description, qty: n(i.quantity), price: n(i.unitPrice), discount: n(i.discount), total: n(i.lineTotal) })),
        totals: [
          { labelKey: "docs.subtotal", value: n(inv.subtotal) },
          ...(n(inv.discountTotal) ? [{ labelKey: "docs.discount", value: -n(inv.discountTotal) }] : []),
          ...(n(inv.installationCharge) ? [{ labelKey: "docs.installation", value: n(inv.installationCharge) }] : []),
          ...(n(inv.transportationCharge) ? [{ labelKey: "docs.transportation", value: n(inv.transportationCharge) }] : []),
          ...(inv.taxEnabled ? [{ labelKey: "docs.tax", value: n(inv.taxTotal) }] : []),
          { labelKey: "docs.total", value: n(inv.total), strong: true },
          { labelKey: "docs.paid", value: n(inv.paidAmount) },
          { labelKey: "docs.remaining", value: n(inv.total) - n(inv.paidAmount), strong: true },
        ],
        notes: inv.notes,
        signatures: ["docs.signAccountant", "docs.signCustomer"],
      };
    }
    case "payment": {
      const p = await receivables.getPayment(ctx, id);
      return {
        titleKey: "docs.receipt", number: p.number, date: p.paymentDate, company: await company(ctx), currency: "",
        party: { labelKey: "docs.receivedFrom", name: p.customer.name, lines: [p.customer.phone].filter(Boolean) as string[] },
        meta: [
          { labelKey: "docs.method", value: `status.PaymentMethod.${p.method}` },
          { labelKey: "docs.account", value: p.cashAccount.name },
          { labelKey: "docs.reference", value: p.reference },
          { labelKey: "docs.salesOrderRef", value: p.salesOrder?.number ?? null },
          { labelKey: "common.status", value: `status.PaymentStatus.${p.status}` },
        ],
        columns: [{ key: "invoice", labelKey: "docs.appliedTo" }, { key: "amount", labelKey: "docs.amount", align: "end", kind: "money" }],
        rows: p.allocations.filter((a) => !a.reversedAt).map((a) => ({ invoice: a.invoice.number, amount: n(a.amount) })),
        totals: [{ labelKey: "docs.amount", value: n(p.amount), strong: true }],
        notes: p.notes,
        signatures: ["docs.signCashier", "docs.signCustomer"],
      };
    }
    case "manufacturing_order": {
      const mo = await manufacturing.getManufacturingOrder(ctx, id);
      const opts = mo.salesOrderItem.quotationItem.options.map((o) => o.name).join("، ");
      return {
        titleKey: "docs.manufacturingOrder", number: mo.number, date: mo.createdAt, company: await company(ctx), currency: "",
        party: { labelKey: "docs.customer", name: mo.customer.name, lines: [mo.customer.phone].filter(Boolean) as string[] },
        meta: [
          { labelKey: "docs.salesOrderRef", value: mo.salesOrder.number },
          { labelKey: "docs.product", value: `${mo.product.name} (${mo.product.code})` },
          { labelKey: "docs.size", value: `${n(mo.width)} × ${n(mo.height)}${mo.thickness ? ` × ${n(mo.thickness)}` : ""} mm` },
          { labelKey: "docs.qty", value: n(mo.quantity) },
          { labelKey: "docs.options", value: opts || null },
          { labelKey: "docs.measurement", value: mo.measurementVersion ? `${mo.measurementVersion.measurement.number} v${mo.measurementVersion.version}` : null },
          { labelKey: "docs.requiredDate", value: mo.requiredDate },
          { labelKey: "docs.priority", value: `status.Priority.${mo.priority}` },
          { labelKey: "docs.bom", value: `v${mo.bom.version} — ${mo.bom.name}` },
          { labelKey: "common.status", value: `status.ManufacturingStatus.${mo.status}` },
        ],
        columns: [
          { key: "code", labelKey: "common.code", kind: "ltr" }, { key: "material", labelKey: "docs.material" }, { key: "unit", labelKey: "fields.unit" },
          { key: "required", labelKey: "docs.required", align: "end", kind: "qty" }, { key: "issued", labelKey: "docs.issued", align: "end", kind: "qty" },
        ],
        rows: mo.items.map((i) => ({ code: i.material.code, material: i.material.name, unit: i.material.unit.name, required: n(i.requiredQuantity), issued: n(i.issuedQuantity) - n(i.returnedQuantity) })),
        totals: [],
        notes: mo.notes,
        signatures: ["docs.signProduction", "docs.signWarehouse", "docs.signQc"],
      };
    }
    case "material_issue": {
      const mi = await manufacturing.getMaterialIssue(ctx, id);
      const showCost = can(ctx.actor, "costing.view");
      return {
        titleKey: mi.type === "ISSUE" ? "docs.materialIssue" : "docs.materialReturn", number: mi.number, date: mi.issueDate, company: await company(ctx), currency: "",
        meta: [
          { labelKey: "docs.manufacturingOrderRef", value: mi.manufacturingOrder.number },
          { labelKey: "docs.customer", value: mi.manufacturingOrder.customer.name },
          { labelKey: "docs.product", value: mi.manufacturingOrder.product.name },
          { labelKey: "nav.warehouses", value: mi.warehouse.name },
          { labelKey: "common.status", value: `status.DocStatus.${mi.status}` },
        ],
        columns: [
          { key: "code", labelKey: "common.code", kind: "ltr" }, { key: "material", labelKey: "docs.material" }, { key: "unit", labelKey: "fields.unit" },
          { key: "qty", labelKey: "docs.qty", align: "end", kind: "qty" },
          ...(showCost ? [{ key: "cost", labelKey: "docs.lineTotal", align: "end" as const, kind: "money" as const }] : []),
        ],
        rows: mi.items.map((i) => ({ code: i.material.code, material: i.material.name, unit: i.material.unit.name, qty: n(i.quantity), cost: i.totalCost === null ? null : n(i.totalCost) })),
        totals: showCost ? [{ labelKey: "docs.total", value: mi.items.reduce((s, i) => s + n(i.totalCost), 0), strong: true }] : [],
        notes: mi.notes,
        signatures: ["docs.signWarehouse", "docs.signReceiver"],
      };
    }
    case "purchase_order": {
      const po = await purchasing.getPurchaseOrder(ctx, id);
      return {
        titleKey: "docs.purchaseOrder", number: po.number, date: po.orderDate, company: await company(ctx), currency: po.currency,
        party: { labelKey: "docs.supplier", name: po.supplier.name, lines: [po.supplier.contactPerson, po.supplier.phone, po.supplier.address].filter(Boolean) as string[] },
        meta: [
          { labelKey: "docs.expectedDate", value: po.expectedDate },
          { labelKey: "docs.deliverTo", value: po.warehouse.name },
          { labelKey: "common.status", value: `status.PurchaseOrderStatus.${po.status}` },
        ],
        columns: [
          { key: "no", labelKey: "docs.no" }, { key: "item", labelKey: "docs.material" }, { key: "unit", labelKey: "fields.unit" },
          { key: "qty", labelKey: "docs.qty", align: "end", kind: "qty" }, { key: "price", labelKey: "docs.unitPrice", align: "end", kind: "money" },
          { key: "discount", labelKey: "docs.discount", align: "end", kind: "money" }, { key: "total", labelKey: "docs.lineTotal", align: "end", kind: "money" },
        ],
        rows: po.items.map((i) => ({ no: i.lineNo, item: `${i.material.name} (${i.material.code})`, unit: i.material.unit.name, qty: n(i.quantity), price: n(i.unitPrice), discount: n(i.discount), total: n(i.lineTotal) })),
        totals: [
          { labelKey: "docs.subtotal", value: n(po.subtotal) },
          ...(po.taxEnabled ? [{ labelKey: "docs.tax", value: n(po.taxTotal) }] : []),
          { labelKey: "docs.total", value: n(po.total), strong: true },
        ],
        notes: [po.paymentTerms, po.notes].filter(Boolean).join("\n\n") || null,
        signatures: ["docs.signPurchasing", "docs.signApproved"],
      };
    }
    case "goods_receipt": {
      const gr = await purchasing.getGoodsReceipt(ctx, id);
      const showCost = can(ctx.actor, "purchases.view") || can(ctx.actor, "costing.view");
      return {
        titleKey: "docs.goodsReceipt", number: gr.number, date: gr.receiptDate, company: await company(ctx), currency: "",
        party: { labelKey: "docs.supplier", name: gr.supplier.name, lines: [gr.supplierDocNo ? `#${gr.supplierDocNo}` : null].filter(Boolean) as string[] },
        meta: [
          { labelKey: "docs.purchaseOrderRef", value: gr.purchaseOrder?.number ?? null },
          { labelKey: "nav.warehouses", value: gr.warehouse.name },
          { labelKey: "common.status", value: `status.DocStatus.${gr.status}` },
        ],
        columns: [
          { key: "code", labelKey: "common.code", kind: "ltr" }, { key: "item", labelKey: "docs.material" }, { key: "unit", labelKey: "fields.unit" },
          { key: "qty", labelKey: "docs.qty", align: "end", kind: "qty" },
          ...(showCost ? [{ key: "cost", labelKey: "docs.unitPrice", align: "end" as const, kind: "money" as const }, { key: "total", labelKey: "docs.lineTotal", align: "end" as const, kind: "money" as const }] : []),
        ],
        rows: gr.items.map((i) => ({ code: i.material.code, item: i.material.name, unit: i.material.unit.name, qty: n(i.quantity), cost: i.unitCost === null ? null : n(i.unitCost), total: i.lineTotal === null ? null : n(i.lineTotal) })),
        totals: showCost ? [{ labelKey: "docs.total", value: gr.items.reduce((s, i) => s + n(i.lineTotal), 0), strong: true }] : [],
        notes: gr.notes,
        signatures: ["docs.signWarehouse", "docs.signSupplier"],
      };
    }
    case "delivery": {
      const d = await deliveries.getDelivery(ctx, id);
      return {
        titleKey: "docs.deliveryNote", number: d.number, date: d.deliveredAt ?? d.scheduledDate ?? d.createdAt, company: await company(ctx), currency: "",
        party: { labelKey: "docs.customer", name: d.customer.name, lines: [d.customer.phone, d.address].filter(Boolean) as string[] },
        meta: [
          { labelKey: "docs.salesOrderRef", value: d.salesOrder.number },
          { labelKey: "docs.scheduledDate", value: d.scheduledDate },
          { labelKey: "docs.driver", value: d.driverName },
          { labelKey: "docs.vehicle", value: d.vehicle },
          { labelKey: "docs.installation", value: `status.InstallationStatus.${d.installationStatus}` },
          { labelKey: "common.status", value: `status.DeliveryStatus.${d.status}` },
          { labelKey: "docs.receivedBy", value: d.receivedByName },
        ],
        columns: [
          { key: "item", labelKey: "docs.item" }, { key: "size", labelKey: "docs.size", kind: "ltr" },
          { key: "qty", labelKey: "docs.qty", align: "end", kind: "qty" }, { key: "delivered", labelKey: "docs.delivered", align: "end", kind: "qty" },
        ],
        rows: d.items.map((i) => {
          const q = i.salesOrderItem.quotationItem;
          return {
            item: `${i.salesOrderItem.product.name} (${i.salesOrderItem.product.code})${q.options.length ? ` — ${q.options.map((o) => o.name).join("، ")}` : ""}`,
            size: `${n(q.width)} × ${n(q.height)}${q.thickness ? ` × ${n(q.thickness)}` : ""} mm`, qty: n(i.quantity), delivered: n(i.deliveredQuantity),
          };
        }),
        totals: [],
        notes: d.notes,
        signatures: ["docs.signDriver", "docs.signCustomer"],
      };
    }
    default: {
      const extra = documentBuilders[type];
      if (extra) return extra(ctx, id);
      throw new AppError("NOT_FOUND", "errors.notFound");
    }
  }
}

/** Later phases register builders here (purchase_order, manufacturing_order, material_issue, delivery ...). */
export const documentBuilders: Record<string, (ctx: ServiceContext, id: string) => Promise<DocModel>> = {};
export { company as companyInfo };
