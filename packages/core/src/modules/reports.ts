import { z } from "zod";
import type { PermissionKey } from "../auth/permissions";
import { can, requirePermission, showroomScopeWhere, type ServiceContext } from "../context";
import { AppError } from "../errors";
import { parse, uuid } from "../validation";

export type ColumnKind = "text" | "money" | "qty" | "date" | "ltr" | "status";
export interface ReportColumn { key: string; labelKey: string; kind?: ColumnKind; statusGroup?: string }
export interface ReportResult {
  columns: ReportColumn[];
  rows: Record<string, string | number | Date | null>[];
  totals?: Record<string, number>;
  truncated?: boolean;
}

export const reportFilterSchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  showroomId: uuid.optional(),
  warehouseId: uuid.optional(),
  customerId: uuid.optional(),
  supplierId: uuid.optional(),
  status: z.string().max(40).optional(),
});
export type ReportFilters = z.infer<typeof reportFilterSchema>;

const LIMIT = 5000;
const n = (v: unknown) => Number(v ?? 0);
const range = (f: ReportFilters, field: string) =>
  f.from || f.to ? { [field]: { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lte: endOfDay(f.to) } : {}) } } : {};
function endOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}
const sumBy = (rows: Record<string, unknown>[], keys: string[]) => Object.fromEntries(keys.map((k) => [k, rows.reduce((s, r) => s + n(r[k]), 0)]));
/** Showroom scope + optional showroom filter for showroom-bound documents. */
const showroomWhere = (ctx: ServiceContext, f: ReportFilters) => ({ ...showroomScopeWhere(ctx.actor, { ownerFields: ["createdById"] }), ...(f.showroomId ? { showroomId: f.showroomId } : {}) });

function aging(rows: { customerOrSupplier: string; id: string; due: Date; remaining: number }[]) {
  const now = Date.now();
  const map = new Map<string, { party: string; current: number; d30: number; d60: number; d90: number; d90p: number; total: number }>();
  for (const r of rows) {
    const e = map.get(r.id) ?? { party: r.customerOrSupplier, current: 0, d30: 0, d60: 0, d90: 0, d90p: 0, total: 0 };
    const days = Math.floor((now - r.due.getTime()) / 86400_000);
    if (days <= 0) e.current += r.remaining;
    else if (days <= 30) e.d30 += r.remaining;
    else if (days <= 60) e.d60 += r.remaining;
    else if (days <= 90) e.d90 += r.remaining;
    else e.d90p += r.remaining;
    e.total += r.remaining;
    map.set(r.id, e);
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
}
const agingColumns = (partyKey: string): ReportColumn[] => [
  { key: "party", labelKey: partyKey }, { key: "current", labelKey: "reports.notDue", kind: "money" }, { key: "d30", labelKey: "reports.d30", kind: "money" },
  { key: "d60", labelKey: "reports.d60", kind: "money" }, { key: "d90", labelKey: "reports.d90", kind: "money" }, { key: "d90p", labelKey: "reports.d90p", kind: "money" }, { key: "total", labelKey: "docs.total", kind: "money" },
];

interface ReportDef {
  permission: PermissionKey;
  titleKey: string;
  filters: ("date" | "showroom" | "warehouse" | "customer" | "supplier")[];
  run: (ctx: ServiceContext, f: ReportFilters) => Promise<ReportResult>;
}

export const REPORTS: Record<string, ReportDef> = {
  customers: {
    permission: "customers.view", titleKey: "reports.customers", filters: ["showroom"],
    async run(ctx, f) {
      const rows = await ctx.db.customer.findMany({ where: { deletedAt: null, ...showroomWhere(ctx, f) }, include: { showroom: { select: { name: true } } }, orderBy: { code: "asc" }, take: LIMIT });
      const showBal = can(ctx.actor, "payments.view");
      const balances = showBal ? await ctx.db.partyLedgerEntry.groupBy({ by: ["customerId"], where: { customerId: { in: rows.map((r) => r.id) } }, _sum: { debit: true, credit: true } }) : [];
      const bal = new Map(balances.map((b) => [b.customerId, n(b._sum.debit) - n(b._sum.credit)]));
      return {
        columns: [{ key: "code", labelKey: "common.code", kind: "ltr" }, { key: "name", labelKey: "common.name" }, { key: "phone", labelKey: "fields.phone", kind: "ltr" }, { key: "city", labelKey: "fields.city" }, { key: "showroom", labelKey: "fields.showroom" }, ...(showBal ? [{ key: "balance", labelKey: "fields.balance", kind: "money" as const }] : [])],
        rows: rows.map((c) => ({ code: c.code, name: c.name, phone: c.phone, city: c.city, showroom: c.showroom?.name ?? null, balance: bal.get(c.id) ?? 0 })),
        truncated: rows.length === LIMIT,
      };
    },
  },
  suppliers: {
    permission: "suppliers.view", titleKey: "reports.suppliers", filters: [],
    async run(ctx) {
      const rows = await ctx.db.supplier.findMany({ where: { deletedAt: null }, orderBy: { code: "asc" }, take: LIMIT });
      const showBal = can(ctx.actor, "supplier_payments.view");
      const balances = showBal ? await ctx.db.partyLedgerEntry.groupBy({ by: ["supplierId"], where: { supplierId: { in: rows.map((r) => r.id) } }, _sum: { debit: true, credit: true } }) : [];
      const bal = new Map(balances.map((b) => [b.supplierId, n(b._sum.credit) - n(b._sum.debit)]));
      return {
        columns: [{ key: "code", labelKey: "common.code", kind: "ltr" }, { key: "name", labelKey: "common.name" }, { key: "contact", labelKey: "fields.contactPerson" }, { key: "phone", labelKey: "fields.phone", kind: "ltr" }, ...(showBal ? [{ key: "balance", labelKey: "fields.balance", kind: "money" as const }] : [])],
        rows: rows.map((s) => ({ code: s.code, name: s.name, contact: s.contactPerson, phone: s.phone, balance: bal.get(s.id) ?? 0 })),
      };
    },
  },
  sales: {
    permission: "invoices.view", titleKey: "reports.sales", filters: ["date", "showroom", "customer"],
    async run(ctx, f) {
      const rows = await ctx.db.customerInvoice.findMany({
        where: { status: { in: ["POSTED", "PARTIALLY_PAID", "PAID"] }, ...showroomWhere(ctx, f), ...(f.customerId ? { customerId: f.customerId } : {}), ...range(f, "invoiceDate") },
        include: { customer: { select: { name: true } }, showroom: { select: { name: true } } }, orderBy: { invoiceDate: "asc" }, take: LIMIT,
      });
      const out = rows.map((i) => ({ number: i.number, date: i.invoiceDate, customer: i.customer.name, showroom: i.showroom.name, subtotal: n(i.subtotal) - n(i.discountTotal), tax: n(i.taxTotal), total: n(i.total), paid: n(i.paidAmount), remaining: n(i.total) - n(i.paidAmount) }));
      return {
        columns: [{ key: "number", labelKey: "common.code", kind: "ltr" }, { key: "date", labelKey: "invoices.invoiceDate", kind: "date" }, { key: "customer", labelKey: "quotations.customer" }, { key: "showroom", labelKey: "fields.showroom" }, { key: "subtotal", labelKey: "reports.net", kind: "money" }, { key: "tax", labelKey: "docs.tax", kind: "money" }, { key: "total", labelKey: "docs.total", kind: "money" }, { key: "paid", labelKey: "invoices.paid", kind: "money" }, { key: "remaining", labelKey: "invoices.remaining", kind: "money" }],
        rows: out, totals: sumBy(out, ["subtotal", "tax", "total", "paid", "remaining"]),
      };
    },
  },
  purchases: {
    permission: "purchases.view", titleKey: "reports.purchases", filters: ["date", "supplier"],
    async run(ctx, f) {
      const rows = await ctx.db.supplierInvoice.findMany({
        where: { status: { in: ["POSTED", "PARTIALLY_PAID", "PAID"] }, ...(f.supplierId ? { supplierId: f.supplierId } : {}), ...range(f, "invoiceDate") },
        include: { supplier: { select: { name: true } } }, orderBy: { invoiceDate: "asc" }, take: LIMIT,
      });
      const out = rows.map((i) => ({ number: i.number, ref: i.supplierInvoiceNo, date: i.invoiceDate, supplier: i.supplier.name, total: n(i.total), paid: n(i.paidAmount), remaining: n(i.total) - n(i.paidAmount) }));
      return {
        columns: [{ key: "number", labelKey: "common.code", kind: "ltr" }, { key: "ref", labelKey: "purchasing.supplierInvoiceNo", kind: "ltr" }, { key: "date", labelKey: "invoices.invoiceDate", kind: "date" }, { key: "supplier", labelKey: "purchasing.supplier" }, { key: "total", labelKey: "docs.total", kind: "money" }, { key: "paid", labelKey: "invoices.paid", kind: "money" }, { key: "remaining", labelKey: "invoices.remaining", kind: "money" }],
        rows: out, totals: sumBy(out, ["total", "paid", "remaining"]),
      };
    },
  },
  quotations: {
    permission: "quotations.view", titleKey: "reports.quotations", filters: ["date", "showroom", "customer"],
    async run(ctx, f) {
      const rows = await ctx.db.quotation.findMany({
        where: { ...showroomScopeWhere(ctx.actor, { ownerFields: ["createdById", "salespersonId"] }), ...(f.showroomId ? { showroomId: f.showroomId } : {}), ...(f.customerId ? { customerId: f.customerId } : {}), ...range(f, "quotationDate") },
        include: { customer: { select: { name: true } }, salesperson: { select: { fullName: true } } }, orderBy: { quotationDate: "asc" }, take: LIMIT,
      });
      const out = rows.map((q) => ({ number: q.number, date: q.quotationDate, customer: q.customer.name, salesperson: q.salesperson.fullName, status: q.status, total: n(q.total) }));
      return {
        columns: [{ key: "number", labelKey: "common.code", kind: "ltr" }, { key: "date", labelKey: "quotations.date", kind: "date" }, { key: "customer", labelKey: "quotations.customer" }, { key: "salesperson", labelKey: "quotations.salesperson" }, { key: "status", labelKey: "common.status", kind: "status", statusGroup: "QuotationStatus" }, { key: "total", labelKey: "docs.total", kind: "money" }],
        rows: out, totals: sumBy(out, ["total"]),
      };
    },
  },
  sales_orders: {
    permission: "sales_orders.view", titleKey: "reports.salesOrders", filters: ["date", "showroom", "customer"],
    async run(ctx, f) {
      const rows = await ctx.db.salesOrder.findMany({
        where: { ...showroomScopeWhere(ctx.actor, { ownerFields: ["createdById", "salespersonId"] }), ...(f.showroomId ? { showroomId: f.showroomId } : {}), ...(f.customerId ? { customerId: f.customerId } : {}), ...range(f, "orderDate") },
        include: { customer: { select: { name: true } } }, orderBy: { orderDate: "asc" }, take: LIMIT,
      });
      const out = rows.map((s) => ({ number: s.number, date: s.orderDate, customer: s.customer.name, required: s.requiredDate, status: s.status, total: n(s.total) }));
      return {
        columns: [{ key: "number", labelKey: "common.code", kind: "ltr" }, { key: "date", labelKey: "salesOrders.orderDate", kind: "date" }, { key: "customer", labelKey: "quotations.customer" }, { key: "required", labelKey: "salesOrders.requiredDate", kind: "date" }, { key: "status", labelKey: "common.status", kind: "status", statusGroup: "SalesOrderStatus" }, { key: "total", labelKey: "docs.total", kind: "money" }],
        rows: out, totals: sumBy(out, ["total"]),
      };
    },
  },
  manufacturing: {
    permission: "manufacturing.view", titleKey: "reports.manufacturing", filters: ["date"],
    async run(ctx, f) {
      const rows = await ctx.db.manufacturingOrder.findMany({ where: range(f, "createdAt"), include: { product: { select: { name: true } }, customer: { select: { name: true } } }, orderBy: { createdAt: "asc" }, take: LIMIT });
      return {
        columns: [{ key: "number", labelKey: "common.code", kind: "ltr" }, { key: "customer", labelKey: "quotations.customer" }, { key: "product", labelKey: "manufacturing.product" }, { key: "size", labelKey: "manufacturing.size", kind: "ltr" }, { key: "qty", labelKey: "manufacturing.quantity", kind: "qty" }, { key: "required", labelKey: "manufacturing.requiredDate", kind: "date" }, { key: "completed", labelKey: "reports.completedAt", kind: "date" }, { key: "status", labelKey: "common.status", kind: "status", statusGroup: "ManufacturingStatus" }],
        rows: rows.map((m) => ({ number: m.number, customer: m.customer.name, product: m.product.name, size: `${n(m.width)} × ${n(m.height)}`, qty: n(m.quantity), required: m.requiredDate, completed: m.completedAt, status: m.status })),
      };
    },
  },
  material_consumption: {
    permission: "inventory.view", titleKey: "reports.materialConsumption", filters: ["date", "warehouse"],
    async run(ctx, f) {
      const rows = await ctx.db.inventoryTransaction.groupBy({
        by: ["materialId", "type"],
        where: { type: { in: ["MATERIAL_ISSUE", "PRODUCTION_RETURN"] }, ...(f.warehouseId ? { warehouseId: f.warehouseId } : {}), ...range(f, "transactionDate") },
        _sum: { quantity: true, totalCost: true },
      });
      const mats = await ctx.db.material.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.materialId))] } }, include: { unit: { select: { name: true } } } });
      const showCost = can(ctx.actor, "costing.view");
      const out = mats.map((m) => {
        const issued = -n(rows.find((r) => r.materialId === m.id && r.type === "MATERIAL_ISSUE")?._sum.quantity);
        const returned = n(rows.find((r) => r.materialId === m.id && r.type === "PRODUCTION_RETURN")?._sum.quantity);
        const cost = -n(rows.find((r) => r.materialId === m.id && r.type === "MATERIAL_ISSUE")?._sum.totalCost) - n(rows.find((r) => r.materialId === m.id && r.type === "PRODUCTION_RETURN")?._sum.totalCost);
        return { code: m.code, name: m.name, unit: m.unit.name, issued, returned, net: issued - returned, cost };
      }).sort((a, b) => a.code.localeCompare(b.code));
      return {
        columns: [{ key: "code", labelKey: "common.code", kind: "ltr" }, { key: "name", labelKey: "docs.material" }, { key: "unit", labelKey: "fields.unit" }, { key: "issued", labelKey: "manufacturing.issued", kind: "qty" }, { key: "returned", labelKey: "manufacturing.returned", kind: "qty" }, { key: "net", labelKey: "reports.netConsumption", kind: "qty" }, ...(showCost ? [{ key: "cost", labelKey: "bom.cost", kind: "money" as const }] : [])],
        rows: out, totals: showCost ? sumBy(out, ["cost"]) : undefined,
      };
    },
  },
  stock_movement: {
    permission: "inventory.view", titleKey: "reports.stockMovement", filters: ["date", "warehouse"],
    async run(ctx, f) {
      const wh = f.warehouseId ? { warehouseId: f.warehouseId } : {};
      const [before, during] = await Promise.all([
        f.from ? ctx.db.inventoryTransaction.groupBy({ by: ["materialId"], where: { ...wh, transactionDate: { lt: f.from } }, _sum: { quantity: true } }) : Promise.resolve([]),
        ctx.db.inventoryTransaction.findMany({ where: { ...wh, ...range(f, "transactionDate") }, select: { materialId: true, quantity: true } }),
      ]);
      const ids = [...new Set([...before.map((b) => b.materialId), ...during.map((d) => d.materialId)])];
      const mats = await ctx.db.material.findMany({ where: { id: { in: ids } }, include: { unit: { select: { name: true } } }, orderBy: { code: "asc" } });
      return {
        columns: [{ key: "code", labelKey: "common.code", kind: "ltr" }, { key: "name", labelKey: "docs.material" }, { key: "unit", labelKey: "fields.unit" }, { key: "opening", labelKey: "reports.opening", kind: "qty" }, { key: "in", labelKey: "cashAccounts.in", kind: "qty" }, { key: "out", labelKey: "cashAccounts.out", kind: "qty" }, { key: "closing", labelKey: "reports.closing", kind: "qty" }],
        rows: mats.map((m) => {
          const opening = n(before.find((b) => b.materialId === m.id)?._sum.quantity);
          const mine = during.filter((d) => d.materialId === m.id).map((d) => n(d.quantity));
          const inQ = mine.filter((q) => q > 0).reduce((s, q) => s + q, 0);
          const outQ = -mine.filter((q) => q < 0).reduce((s, q) => s + q, 0);
          return { code: m.code, name: m.name, unit: m.unit.name, opening, in: inQ, out: outQ, closing: opening + inQ - outQ };
        }),
      };
    },
  },
  low_stock: {
    permission: "inventory.view", titleKey: "reports.lowStock", filters: [],
    async run(ctx) {
      const rows = await ctx.db.$queryRaw<{ code: string; name: string; unit: string; on_hand: string; reorder_level: string; min_stock: string }[]>`
        SELECT m.code, m.name, u.name AS unit, COALESCE(SUM(b.quantity),0)::text AS on_hand, m.reorder_level::text, m.min_stock::text
        FROM materials m JOIN units u ON u.id = m.unit_id LEFT JOIN inventory_balances b ON b.material_id = m.id
        WHERE m.deleted_at IS NULL AND m.status = 'ACTIVE' GROUP BY m.id, u.name HAVING COALESCE(SUM(b.quantity),0) <= m.reorder_level ORDER BY m.code`;
      return {
        columns: [{ key: "code", labelKey: "common.code", kind: "ltr" }, { key: "name", labelKey: "docs.material" }, { key: "unit", labelKey: "fields.unit" }, { key: "onHand", labelKey: "materials.onHand", kind: "qty" }, { key: "reorder", labelKey: "materials.reorderLevel", kind: "qty" }, { key: "min", labelKey: "materials.minStock", kind: "qty" }],
        rows: rows.map((r) => ({ code: r.code, name: r.name, unit: r.unit, onHand: n(r.on_hand), reorder: n(r.reorder_level), min: n(r.min_stock) })),
      };
    },
  },
  customer_balances: {
    permission: "payments.view", titleKey: "reports.customerBalances", filters: ["showroom"],
    async run(ctx, f) {
      const inv = await ctx.db.customerInvoice.findMany({ where: { status: { in: ["POSTED", "PARTIALLY_PAID"] }, ...showroomWhere(ctx, f) }, include: { customer: { select: { id: true, name: true } } } });
      const rows = aging(inv.map((i) => ({ id: i.customer.id, customerOrSupplier: i.customer.name, due: i.dueDate ?? i.invoiceDate, remaining: n(i.total) - n(i.paidAmount) })));
      return { columns: agingColumns("quotations.customer"), rows, totals: sumBy(rows, ["current", "d30", "d60", "d90", "d90p", "total"]) };
    },
  },
  supplier_balances: {
    permission: "supplier_payments.view", titleKey: "reports.supplierBalances", filters: [],
    async run(ctx) {
      const inv = await ctx.db.supplierInvoice.findMany({ where: { status: { in: ["POSTED", "PARTIALLY_PAID"] } }, include: { supplier: { select: { id: true, name: true } } } });
      const rows = aging(inv.map((i) => ({ id: i.supplier.id, customerOrSupplier: i.supplier.name, due: i.dueDate ?? i.invoiceDate, remaining: n(i.total) - n(i.paidAmount) })));
      return { columns: agingColumns("purchasing.supplier"), rows, totals: sumBy(rows, ["current", "d30", "d60", "d90", "d90p", "total"]) };
    },
  },
  payments: {
    permission: "payments.view", titleKey: "reports.payments", filters: ["date", "customer"],
    async run(ctx, f) {
      const rows = await ctx.db.customerPayment.findMany({ where: { status: "POSTED", ...(f.customerId ? { customerId: f.customerId } : {}), ...range(f, "paymentDate") }, include: { customer: { select: { name: true } }, cashAccount: { select: { name: true } } }, orderBy: { paymentDate: "asc" }, take: LIMIT });
      const out = rows.map((p) => ({ number: p.number, date: p.paymentDate, customer: p.customer.name, method: p.method, account: p.cashAccount.name, amount: n(p.amount) }));
      return {
        columns: [{ key: "number", labelKey: "common.code", kind: "ltr" }, { key: "date", labelKey: "payments.date", kind: "date" }, { key: "customer", labelKey: "quotations.customer" }, { key: "method", labelKey: "payments.method", kind: "status", statusGroup: "PaymentMethod" }, { key: "account", labelKey: "payments.account" }, { key: "amount", labelKey: "payments.amount", kind: "money" }],
        rows: out, totals: sumBy(out, ["amount"]),
      };
    },
  },
  expenses: {
    permission: "expenses.view", titleKey: "reports.expenses", filters: ["date", "showroom"],
    async run(ctx, f) {
      const rows = await ctx.db.expense.findMany({ where: { status: "POSTED", ...(f.showroomId ? { showroomId: f.showroomId } : {}), ...range(f, "expenseDate") }, include: { category: { select: { name: true } } }, orderBy: { expenseDate: "asc" }, take: LIMIT });
      const out = rows.map((e) => ({ number: e.number, date: e.expenseDate, category: e.category.name, description: e.description, amount: n(e.amount) }));
      return {
        columns: [{ key: "number", labelKey: "common.code", kind: "ltr" }, { key: "date", labelKey: "expenses.date", kind: "date" }, { key: "category", labelKey: "fields.category" }, { key: "description", labelKey: "fields.description" }, { key: "amount", labelKey: "payments.amount", kind: "money" }],
        rows: out, totals: sumBy(out, ["amount"]),
      };
    },
  },
  product_sales: {
    permission: "invoices.view", titleKey: "reports.productSales", filters: ["date", "showroom"],
    async run(ctx, f) {
      const items = await ctx.db.invoiceItem.findMany({
        where: { invoice: { status: { in: ["POSTED", "PARTIALLY_PAID", "PAID"] }, ...showroomWhere(ctx, f), ...range(f, "invoiceDate") }, salesOrderItemId: { not: null } },
        select: { quantity: true, lineTotal: true, salesOrderItem: { select: { product: { select: { code: true, name: true } } } } },
      });
      const map = new Map<string, { code: string; name: string; qty: number; amount: number }>();
      for (const i of items) {
        const p = i.salesOrderItem!.product;
        const e = map.get(p.code) ?? { code: p.code, name: p.name, qty: 0, amount: 0 };
        e.qty += n(i.quantity);
        e.amount += n(i.lineTotal);
        map.set(p.code, e);
      }
      const out = [...map.values()].sort((a, b) => b.amount - a.amount);
      return { columns: [{ key: "code", labelKey: "common.code", kind: "ltr" }, { key: "name", labelKey: "manufacturing.product" }, { key: "qty", labelKey: "docs.qty", kind: "qty" }, { key: "amount", labelKey: "reports.net", kind: "money" }], rows: out, totals: sumBy(out, ["qty", "amount"]) };
    },
  },
  showroom_sales: {
    permission: "invoices.view", titleKey: "reports.showroomSales", filters: ["date"],
    async run(ctx, f) {
      const rows = await ctx.db.customerInvoice.groupBy({ by: ["showroomId"], where: { status: { in: ["POSTED", "PARTIALLY_PAID", "PAID"] }, ...showroomWhere(ctx, f), ...range(f, "invoiceDate") }, _sum: { total: true, paidAmount: true }, _count: { _all: true } });
      const shows = await ctx.db.showroom.findMany({ where: { id: { in: rows.map((r) => r.showroomId) } } });
      const out = rows.map((r) => ({ showroom: shows.find((s) => s.id === r.showroomId)?.name ?? "—", invoices: r._count._all, total: n(r._sum.total), paid: n(r._sum.paidAmount) })).sort((a, b) => b.total - a.total);
      return { columns: [{ key: "showroom", labelKey: "fields.showroom" }, { key: "invoices", labelKey: "nav.invoices", kind: "qty" }, { key: "total", labelKey: "docs.total", kind: "money" }, { key: "paid", labelKey: "invoices.paid", kind: "money" }], rows: out, totals: sumBy(out, ["invoices", "total", "paid"]) };
    },
  },
  manufacturing_cost: {
    permission: "costing.view", titleKey: "reports.manufacturingCost", filters: ["date"],
    async run(ctx, f) {
      const rows = await ctx.db.manufacturingOrder.findMany({ where: { status: "COMPLETED", ...range(f, "completedAt") }, include: { product: { select: { name: true } } }, orderBy: { completedAt: "asc" }, take: LIMIT });
      const out = rows.map((m) => {
        const actual = n(m.actualMaterialCost) + n(m.actualLaborCost) + n(m.actualOverheadCost) + n(m.actualOtherCost);
        return { number: m.number, product: m.product.name, qty: n(m.quantity), material: n(m.actualMaterialCost), labor: n(m.actualLaborCost), overhead: n(m.actualOverheadCost), other: n(m.actualOtherCost), total: actual, unitCost: actual / Math.max(n(m.quantity), 1) };
      });
      return {
        columns: [{ key: "number", labelKey: "common.code", kind: "ltr" }, { key: "product", labelKey: "manufacturing.product" }, { key: "qty", labelKey: "docs.qty", kind: "qty" }, { key: "material", labelKey: "manufacturing.material", kind: "money" }, { key: "labor", labelKey: "manufacturing.labor", kind: "money" }, { key: "overhead", labelKey: "manufacturing.overhead", kind: "money" }, { key: "other", labelKey: "manufacturing.other", kind: "money" }, { key: "total", labelKey: "docs.total", kind: "money" }, { key: "unitCost", labelKey: "reports.unitCost", kind: "money" }],
        rows: out, totals: sumBy(out, ["qty", "material", "labor", "overhead", "other", "total"]),
      };
    },
  },
  estimated_vs_actual: {
    permission: "costing.view", titleKey: "reports.estimatedVsActual", filters: ["date"],
    async run(ctx, f) {
      const rows = await ctx.db.manufacturingOrder.findMany({ where: { status: "COMPLETED", ...range(f, "completedAt") }, include: { product: { select: { name: true } } }, orderBy: { completedAt: "asc" }, take: LIMIT });
      const out = rows.map((m) => {
        const est = n(m.estimatedMaterialCost) + n(m.estimatedLaborCost) + n(m.estimatedOverheadCost);
        const act = n(m.actualMaterialCost) + n(m.actualLaborCost) + n(m.actualOverheadCost) + n(m.actualOtherCost);
        return { number: m.number, product: m.product.name, estimated: est, actual: act, variance: act - est, variancePct: est ? ((act - est) / est) * 100 : 0 };
      });
      return {
        columns: [{ key: "number", labelKey: "common.code", kind: "ltr" }, { key: "product", labelKey: "manufacturing.product" }, { key: "estimated", labelKey: "manufacturing.estimated", kind: "money" }, { key: "actual", labelKey: "manufacturing.actual", kind: "money" }, { key: "variance", labelKey: "manufacturing.variance", kind: "money" }, { key: "variancePct", labelKey: "reports.variancePct", kind: "qty" }],
        rows: out, totals: sumBy(out, ["estimated", "actual", "variance"]),
      };
    },
  },
  material_variance: {
    permission: "costing.view", titleKey: "reports.materialVariance", filters: ["date"],
    async run(ctx, f) {
      const items = await ctx.db.manufacturingOrderItem.findMany({
        where: { manufacturingOrder: { status: "COMPLETED", ...range(f, "completedAt") } },
        include: { material: { select: { code: true, name: true, unit: { select: { name: true } } } } },
      });
      const map = new Map<string, { code: string; name: string; unit: string; estQty: number; actQty: number; estCost: number; actCost: number }>();
      for (const i of items) {
        const e = map.get(i.material.code) ?? { code: i.material.code, name: i.material.name, unit: i.material.unit.name, estQty: 0, actQty: 0, estCost: 0, actCost: 0 };
        e.estQty += n(i.requiredQuantity);
        e.actQty += n(i.issuedQuantity) - n(i.returnedQuantity);
        e.estCost += n(i.estimatedCost);
        e.actCost += n(i.actualCost);
        map.set(i.material.code, e);
      }
      const out = [...map.values()].map((e) => ({ ...e, qtyVar: e.actQty - e.estQty, costVar: e.actCost - e.estCost })).sort((a, b) => Math.abs(b.costVar) - Math.abs(a.costVar));
      return {
        columns: [{ key: "code", labelKey: "common.code", kind: "ltr" }, { key: "name", labelKey: "docs.material" }, { key: "unit", labelKey: "fields.unit" }, { key: "estQty", labelKey: "manufacturing.estimated", kind: "qty" }, { key: "actQty", labelKey: "manufacturing.actual", kind: "qty" }, { key: "qtyVar", labelKey: "manufacturing.variance", kind: "qty" }, { key: "estCost", labelKey: "reports.estimatedCost", kind: "money" }, { key: "actCost", labelKey: "reports.actualCost", kind: "money" }, { key: "costVar", labelKey: "reports.costVariance", kind: "money" }],
        rows: out, totals: sumBy(out, ["estCost", "actCost", "costVar"]),
      };
    },
  },
};

export function availableReports(ctx: ServiceContext) {
  if (!can(ctx.actor, "reports.view")) return [];
  return Object.entries(REPORTS).filter(([, d]) => can(ctx.actor, d.permission)).map(([id, d]) => ({ id, titleKey: d.titleKey, filters: d.filters }));
}

/** Runs a report. Requires reports.view AND the report's own data permission. */
export async function runReport(ctx: ServiceContext, id: string, input: unknown) {
  requirePermission(ctx, "reports.view");
  const def = REPORTS[id];
  if (!def) throw new AppError("NOT_FOUND", "errors.notFound");
  requirePermission(ctx, def.permission);
  const filters = parse(reportFilterSchema, input);
  const result = await def.run(ctx, filters);
  return { id, titleKey: def.titleKey, filters, ...result };
}
