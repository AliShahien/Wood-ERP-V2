import { Prisma } from "@edge/db";
import { can, showroomScopeWhere, type ServiceContext } from "../context";

const n = (v: unknown) => Number(v ?? 0);

function periodStarts() {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const month = new Date(now.getFullYear(), now.getMonth(), 1);
  const sixMonths = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  return { today, month, sixMonths };
}

/**
 * Management/role dashboard. Every number is computed from database documents and ledgers at
 * request time; sections are included only when the user has the matching permission.
 */
export async function getDashboard(ctx: ServiceContext) {
  const a = ctx.actor;
  const { today, month, sixMonths } = periodStarts();
  const sales = can(a, "dashboard.sales") || can(a, "dashboard.management");
  const finance = can(a, "dashboard.finance") || can(a, "dashboard.management");
  const inventory = can(a, "dashboard.inventory") || can(a, "dashboard.management");
  const production = can(a, "dashboard.production") || can(a, "dashboard.management");
  const costing = can(a, "costing.view");
  const scope = showroomScopeWhere(a, { ownerFields: ["createdById"] });
  const posted = { status: { in: ["POSTED" as const, "PARTIALLY_PAID" as const, "PAID" as const] } };

  const out: Record<string, unknown> = {};
  const sections: Promise<void>[] = [];

  if (sales) sections.push((async () => {
    const invoiceScope = a.isSuperAdmin || a.dataScope === "ALL" ? Prisma.empty
      : a.dataScope === "SHOWROOM" ? Prisma.sql`AND ci.showroom_id = ${a.showroomId}::uuid`
      : Prisma.sql`AND ci.created_by = ${a.userId}::uuid`;
    const [todaySales, monthSales, pendingQuotations, byShowroomRaw, monthly, productTotals] = await Promise.all([
      ctx.db.customerInvoice.aggregate({ where: { ...posted, ...scope, invoiceDate: { gte: today } }, _sum: { total: true } }),
      ctx.db.customerInvoice.aggregate({ where: { ...posted, ...scope, invoiceDate: { gte: month } }, _sum: { total: true } }),
      ctx.db.quotation.count({ where: { status: "SUBMITTED", ...showroomScopeWhere(a, { ownerFields: ["createdById", "salespersonId"] }) } }),
      ctx.db.customerInvoice.groupBy({ by: ["showroomId"], where: { ...posted, ...scope, invoiceDate: { gte: month } }, _sum: { total: true } }),
      ctx.db.$queryRaw<{ period: string; value: string }[]>`
        SELECT to_char(date_trunc('month', ci.invoice_date), 'YYYY-MM') AS period, SUM(ci.total)::text AS value
        FROM customer_invoices ci
        WHERE ci.status IN ('POSTED', 'PARTIALLY_PAID', 'PAID') AND ci.invoice_date >= ${sixMonths} ${invoiceScope}
        GROUP BY 1`,
      ctx.db.$queryRaw<{ name: string; value: string }[]>`
        SELECT p.name, SUM(ii.line_total)::text AS value
        FROM invoice_items ii
        JOIN customer_invoices ci ON ci.id = ii.invoice_id
        JOIN sales_order_items soi ON soi.id = ii.sales_order_item_id
        JOIN products p ON p.id = soi.product_id
        WHERE ci.status IN ('POSTED', 'PARTIALLY_PAID', 'PAID') AND ci.invoice_date >= ${month} ${invoiceScope}
        GROUP BY p.name ORDER BY SUM(ii.line_total) DESC LIMIT 8`,
    ]);
    const showrooms = await ctx.db.showroom.findMany({ where: { id: { in: byShowroomRaw.map((r) => r.showroomId) } }, select: { id: true, name: true } });
    const byMonth = new Map<string, number>();
    for (let i = 0; i < 6; i++) {
      const d = new Date(sixMonths.getFullYear(), sixMonths.getMonth() + i, 1);
      byMonth.set(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, 0);
    }
    for (const r of monthly) if (byMonth.has(r.period)) byMonth.set(r.period, n(r.value));
    out.sales = {
      today: n(todaySales._sum.total),
      month: n(monthSales._sum.total),
      pendingQuotations,
      byShowroom: byShowroomRaw.map((r) => ({ name: showrooms.find((s) => s.id === r.showroomId)?.name ?? "—", value: n(r._sum.total) })).sort((x, y) => y.value - x.value),
      byMonth: [...byMonth.entries()].map(([k, v]) => ({ period: k, value: v })),
      byProduct: productTotals.map((r) => ({ name: r.name, value: n(r.value) })),
    };
  })());

  if (finance) sections.push((async () => {
    const [ar, ap, cash, expensesMonth, purchasesMonth] = await Promise.all([
      ctx.db.partyLedgerEntry.aggregate({ where: { partyType: "CUSTOMER" }, _sum: { debit: true, credit: true } }),
      ctx.db.partyLedgerEntry.aggregate({ where: { partyType: "SUPPLIER" }, _sum: { debit: true, credit: true } }),
      ctx.db.cashTransaction.groupBy({ by: ["cashAccountId", "direction"], _sum: { amount: true } }),
      ctx.db.expense.aggregate({ where: { status: "POSTED", expenseDate: { gte: month } }, _sum: { amount: true } }),
      ctx.db.supplierInvoice.aggregate({ where: { ...posted, invoiceDate: { gte: month } }, _sum: { total: true } }),
    ]);
    const accounts = await ctx.db.cashAccount.findMany({ select: { id: true, name: true, type: true } });
    const bal = new Map<string, number>();
    for (const c of cash) bal.set(c.cashAccountId, (bal.get(c.cashAccountId) ?? 0) + (c.direction === "IN" ? 1 : -1) * n(c._sum.amount));
    out.finance = {
      receivables: n(ar._sum.debit) - n(ar._sum.credit),
      payables: n(ap._sum.credit) - n(ap._sum.debit),
      cash: accounts.filter((x) => x.type === "CASH").reduce((s, x) => s + (bal.get(x.id) ?? 0), 0),
      bank: accounts.filter((x) => x.type === "BANK").reduce((s, x) => s + (bal.get(x.id) ?? 0), 0),
      expensesMonth: n(expensesMonth._sum.amount),
      purchasesMonth: n(purchasesMonth._sum.total),
      accounts: accounts.map((x) => ({ name: x.name, type: x.type, balance: bal.get(x.id) ?? 0 })),
    };
  })());

  if (inventory) sections.push((async () => {
    const [lowStock, value, recent] = await Promise.all([
      ctx.db.$queryRaw<{ c: bigint }[]>`SELECT COUNT(*) AS c FROM (SELECT m.id FROM materials m LEFT JOIN inventory_balances b ON b.material_id = m.id WHERE m.deleted_at IS NULL AND m.status='ACTIVE' AND m.reorder_level > 0 GROUP BY m.id HAVING COALESCE(SUM(b.quantity),0) <= m.reorder_level) x`,
      costing ? ctx.db.$queryRaw<{ v: string | null }[]>`SELECT SUM(b.quantity * m.average_cost)::text AS v FROM inventory_balances b JOIN materials m ON m.id = b.material_id` : Promise.resolve([{ v: null }]),
      ctx.db.inventoryTransaction.findMany({ orderBy: { createdAt: "desc" }, take: 8, select: { id: true, type: true, quantity: true, referenceNumber: true, transactionDate: true, material: { select: { name: true } } } }),
    ]);
    out.inventory = { lowStock: Number(lowStock[0]?.c ?? 0), value: costing ? n(value[0]?.v) : null, recent };
  })());

  if (production) sections.push((async () => {
    const [byStatus, completedMonth, delayed, completedCosts] = await Promise.all([
      ctx.db.manufacturingOrder.groupBy({ by: ["status"], where: { status: { notIn: ["COMPLETED", "CANCELLED"] } }, _count: { _all: true } }),
      ctx.db.manufacturingOrder.count({ where: { status: "COMPLETED", completedAt: { gte: month } } }),
      ctx.db.manufacturingOrder.count({ where: { requiredDate: { lt: new Date() }, status: { notIn: ["COMPLETED", "CANCELLED"] } } }),
      costing ? ctx.db.manufacturingOrder.aggregate({ where: { status: "COMPLETED", completedAt: { gte: month } }, _sum: { estimatedMaterialCost: true, estimatedLaborCost: true, estimatedOverheadCost: true, actualMaterialCost: true, actualLaborCost: true, actualOverheadCost: true, actualOtherCost: true } }) : Promise.resolve(null),
    ]);
    const s = completedCosts?._sum;
    out.production = {
      active: byStatus.reduce((t, r) => t + r._count._all, 0),
      byStatus: byStatus.map((r) => ({ status: r.status, count: r._count._all })),
      completedMonth,
      delayed,
      estimatedCost: s ? n(s.estimatedMaterialCost) + n(s.estimatedLaborCost) + n(s.estimatedOverheadCost) : null,
      actualCost: s ? n(s.actualMaterialCost) + n(s.actualLaborCost) + n(s.actualOverheadCost) + n(s.actualOtherCost) : null,
    };
  })());
  await Promise.all(sections);
  return out;
}

// ───────────────────────── Global search ─────────────────────────

export interface SearchHit { type: string; id: string; title: string; subtitle?: string; href: string }

/** Searches the entities the user may see; each type requires its own view permission and scope. */
export async function globalSearch(ctx: ServiceContext, q: string): Promise<SearchHit[]> {
  const term = q.trim().slice(0, 100);
  if (term.length < 2) return [];
  const a = ctx.actor;
  const ci = { contains: term, mode: "insensitive" as const };
  const tasks: Promise<SearchHit[]>[] = [];
  if (can(a, "customers.view")) {
    tasks.push(ctx.db.customer.findMany({ where: { deletedAt: null, ...showroomScopeWhere(a), AND: [{ OR: [{ name: ci }, { code: ci }, { phone: { contains: term } }, { whatsapp: { contains: term } }] }] }, take: 6, select: { id: true, name: true, code: true, phone: true } })
      .then((r) => r.map((c) => ({ type: "customer", id: c.id, title: c.name, subtitle: [c.code, c.phone].filter(Boolean).join(" · "), href: `/customers/${c.id}` }))));
  }
  if (can(a, "quotations.view")) {
    tasks.push(ctx.db.quotation.findMany({ where: { number: ci, ...showroomScopeWhere(a, { ownerFields: ["createdById", "salespersonId"] }) }, take: 5, select: { id: true, number: true, customer: { select: { name: true } } } })
      .then((r) => r.map((x) => ({ type: "quotation", id: x.id, title: x.number, subtitle: x.customer.name, href: `/quotations/${x.id}` }))));
  }
  if (can(a, "sales_orders.view")) {
    tasks.push(ctx.db.salesOrder.findMany({ where: { number: ci, ...showroomScopeWhere(a, { ownerFields: ["createdById", "salespersonId"] }) }, take: 5, select: { id: true, number: true, customer: { select: { name: true } } } })
      .then((r) => r.map((x) => ({ type: "sales_order", id: x.id, title: x.number, subtitle: x.customer.name, href: `/sales-orders/${x.id}` }))));
  }
  if (can(a, "manufacturing.view")) {
    tasks.push(ctx.db.manufacturingOrder.findMany({ where: { number: ci }, take: 5, select: { id: true, number: true, product: { select: { name: true } } } })
      .then((r) => r.map((x) => ({ type: "manufacturing_order", id: x.id, title: x.number, subtitle: x.product.name, href: `/manufacturing/${x.id}` }))));
  }
  if (can(a, "products.view")) {
    tasks.push(ctx.db.product.findMany({ where: { deletedAt: null, OR: [{ name: ci }, { code: ci }] }, take: 5, select: { id: true, name: true, code: true } })
      .then((r) => r.map((x) => ({ type: "product", id: x.id, title: x.name, subtitle: x.code, href: `/gallery/${x.id}` }))));
  }
  if (can(a, "materials.view")) {
    tasks.push(ctx.db.material.findMany({ where: { deletedAt: null, OR: [{ name: ci }, { code: ci }, { barcode: term }] }, take: 5, select: { id: true, name: true, code: true } })
      .then((r) => r.map((x) => ({ type: "material", id: x.id, title: x.name, subtitle: x.code, href: `/materials/${x.id}` }))));
  }
  if (can(a, "suppliers.view")) {
    tasks.push(ctx.db.supplier.findMany({ where: { deletedAt: null, OR: [{ name: ci }, { code: ci }, { phone: { contains: term } }] }, take: 5, select: { id: true, name: true, code: true } })
      .then((r) => r.map((x) => ({ type: "supplier", id: x.id, title: x.name, subtitle: x.code, href: `/suppliers/${x.id}` }))));
  }
  if (can(a, "purchases.view")) {
    tasks.push(ctx.db.purchaseOrder.findMany({ where: { number: ci }, take: 5, select: { id: true, number: true, supplier: { select: { name: true } } } })
      .then((r) => r.map((x) => ({ type: "purchase_order", id: x.id, title: x.number, subtitle: x.supplier.name, href: `/purchase-orders/${x.id}` }))));
  }
  if (can(a, "invoices.view")) {
    tasks.push(ctx.db.customerInvoice.findMany({ where: { number: ci, ...showroomScopeWhere(a) }, take: 5, select: { id: true, number: true, customer: { select: { name: true } } } })
      .then((r) => r.map((x) => ({ type: "invoice", id: x.id, title: x.number, subtitle: x.customer.name, href: `/invoices/${x.id}` }))));
  }
  return (await Promise.all(tasks)).flat();
}
