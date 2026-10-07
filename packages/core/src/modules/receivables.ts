import { z } from "zod";
import type { Tx } from "@edge/db";
import { assertInShowroomScope, requirePermission, showroomScopeWhere, type ServiceContext } from "../context";
import { AppError, notFound } from "../errors";
import { audit } from "../platform/audit";
import { postCash, postLedger, reverseCash, reverseLedger } from "../platform/ledger";
import { D, money, sum, ZERO, type Dec } from "../platform/money";
import { nextNumber } from "../platform/numbering";
import { listQuerySchema, pageArgs, toPage } from "../platform/pagination";
import { optionalText, parse, uuid } from "../validation";
import { computeTotals } from "./pricing";

// ═════════════════════════ Invoices ═════════════════════════

export const invoiceFromSoSchema = z.object({
  lines: z.array(z.object({ salesOrderItemId: uuid, quantity: z.coerce.number().positive() })).optional(),
  invoiceDate: z.coerce.date().optional(),
  dueDate: z.coerce.date().nullable().optional(),
  includeCharges: z.boolean().optional(),
  taxEnabled: z.boolean().optional(),
  taxRate: z.coerce.number().min(0).max(100).optional(),
  notes: optionalText(2000),
});

export const invoiceListSchema = listQuerySchema.extend({
  status: z.enum(["DRAFT", "POSTED", "PARTIALLY_PAID", "PAID", "CANCELLED"]).optional(),
  customerId: uuid.optional(),
  salesOrderId: uuid.optional(),
  overdue: z.enum(["1"]).optional(),
});

export async function listInvoices(ctx: ServiceContext, input: unknown) {
  requirePermission(ctx, "invoices.view");
  const q = parse(invoiceListSchema, input);
  const where = {
    ...showroomScopeWhere(ctx.actor),
    ...(q.status ? { status: q.status } : {}),
    ...(q.customerId ? { customerId: q.customerId } : {}),
    ...(q.salesOrderId ? { salesOrderId: q.salesOrderId } : {}),
    ...(q.overdue ? { status: { in: ["POSTED" as const, "PARTIALLY_PAID" as const] }, dueDate: { lt: new Date() } } : {}),
    ...(q.q ? { OR: [{ number: { contains: q.q, mode: "insensitive" as const } }, { customer: { name: { contains: q.q, mode: "insensitive" as const } } }] } : {}),
  };
  const [items, total] = await Promise.all([
    ctx.db.customerInvoice.findMany({
      where,
      select: { id: true, number: true, status: true, invoiceDate: true, dueDate: true, total: true, paidAmount: true, customer: { select: { id: true, name: true } }, salesOrder: { select: { id: true, number: true } } },
      orderBy: { createdAt: "desc" },
      ...pageArgs(q),
    }),
    ctx.db.customerInvoice.count({ where }),
  ]);
  return toPage(items, total, q);
}

export async function getInvoice(ctx: ServiceContext, id: string) {
  requirePermission(ctx, "invoices.view");
  const inv = await ctx.db.customerInvoice.findUnique({
    where: { id },
    include: {
      customer: true,
      showroom: { select: { id: true, name: true, address: true, phone: true } },
      salesOrder: { select: { id: true, number: true } },
      items: { orderBy: { lineNo: "asc" } },
      allocations: { where: { reversedAt: null }, include: { payment: { select: { id: true, number: true, paymentDate: true, method: true } } } },
    },
  });
  if (!inv) throw notFound("invoice");
  assertInShowroomScope(ctx.actor, inv);
  return inv;
}

/** Drafts an invoice for the uninvoiced quantities of a sales order (or the given lines). */
export async function createInvoiceFromSalesOrder(ctx: ServiceContext, salesOrderId: string, input: unknown) {
  requirePermission(ctx, "invoices.create");
  const data = parse(invoiceFromSoSchema, input);
  return ctx.db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM sales_orders WHERE id = ${salesOrderId}::uuid FOR UPDATE`;
    const so = await tx.salesOrder.findUnique({
      where: { id: salesOrderId },
      include: { quotation: true, items: { include: { quotationItem: { include: { product: { select: { name: true, code: true } }, options: true } } }, orderBy: { lineNo: "asc" } } },
    });
    if (!so) throw notFound("sales_order");
    assertInShowroomScope(ctx.actor, so);
    if (so.status === "CANCELLED") throw new AppError("INVALID_TRANSITION", "errors.invalidTransition");
    const openDraft = await tx.customerInvoice.count({ where: { salesOrderId, status: "DRAFT" } });
    if (openDraft) throw new AppError("CONFLICT", "errors.draftInvoiceExists");

    const requested = new Map((data.lines ?? []).map((l) => [l.salesOrderItemId, l.quantity]));
    const lines = so.items
      .map((i) => {
        const remaining = D(i.quantity).minus(D(i.invoicedQuantity));
        const qty = data.lines ? D(requested.get(i.id) ?? 0) : remaining;
        if (qty.greaterThan(remaining)) throw new AppError("VALIDATION", "errors.overInvoice", [{ path: "lines", code: "range" }]);
        return { item: i, qty };
      })
      .filter((l) => l.qty.greaterThan(0));
    if (!lines.length) throw new AppError("VALIDATION", "errors.nothingToInvoice");

    const previous = await tx.customerInvoice.count({ where: { salesOrderId, status: { not: "CANCELLED" } } });
    const includeCharges = data.includeCharges ?? previous === 0;
    const qt = so.quotation;
    const taxEnabled = data.taxEnabled ?? qt.taxEnabled;
    const taxRate = taxEnabled ? (data.taxRate ?? Number(qt.taxRate)) : 0;
    const invoiceLines = lines.map((l, idx) => {
      const qi = l.item.quotationItem;
      // Line discount pro-rata to the invoiced share of the line.
      const discount = money(D(qi.discount).times(l.qty).div(D(qi.quantity)));
      const opts = qi.options.map((o) => o.name).join("، ");
      return {
        lineNo: idx + 1, salesOrderItemId: l.item.id,
        description: `${qi.product.name} ${qi.width}×${qi.height}${qi.thickness ? `×${qi.thickness}` : ""} mm${opts ? ` — ${opts}` : ""}`,
        quantity: l.qty, unitPrice: qi.unitPrice, discount,
      };
    });
    // Document discount apportioned by the invoiced share of the quotation subtotal.
    const lineBase = sum(invoiceLines.map((l) => D(l.quantity).times(D(l.unitPrice)).minus(l.discount)));
    const share = D(qt.subtotal).isZero() ? ZERO : lineBase.div(D(qt.subtotal));
    const discountValue = money(D(qt.discountTotal).times(share));
    const totals = computeTotals({
      lines: invoiceLines, discountType: "AMOUNT", discountValue,
      installationCharge: includeCharges ? qt.installationCharge : 0, transportationCharge: includeCharges ? qt.transportationCharge : 0,
      taxEnabled, taxRate,
    });
    const date = data.invoiceDate ?? new Date();
    const number = await nextNumber(tx, "INVOICE", date);
    const inv = await tx.customerInvoice.create({
      data: {
        number, salesOrderId, customerId: so.customerId, showroomId: so.showroomId, invoiceDate: date, dueDate: data.dueDate ?? null,
        currency: so.currency, subtotal: totals.subtotal, discountTotal: totals.discountTotal,
        installationCharge: includeCharges ? qt.installationCharge : 0, transportationCharge: includeCharges ? qt.transportationCharge : 0,
        taxEnabled, taxRate, taxTotal: totals.taxTotal, total: totals.total, notes: data.notes, createdById: ctx.actor.userId,
        items: { create: invoiceLines.map((l, i) => ({ ...l, lineTotal: totals.lineTotals[i]! })) },
      },
    });
    await audit(tx, ctx, { action: "invoice.create", entityType: "invoice", entityId: inv.id, entityNumber: number, newValues: { salesOrder: so.number, total: inv.total } });
    return inv;
  });
}

async function lockInvoice(tx: Tx, ctx: ServiceContext, id: string) {
  await tx.$queryRaw`SELECT id FROM customer_invoices WHERE id = ${id}::uuid FOR UPDATE`;
  const inv = await tx.customerInvoice.findUnique({ where: { id }, include: { items: true } });
  if (!inv) throw notFound("invoice");
  assertInShowroomScope(ctx.actor, inv);
  return inv;
}

function invoiceStatus(total: Dec, paid: Dec): "POSTED" | "PARTIALLY_PAID" | "PAID" {
  if (paid.greaterThanOrEqualTo(total)) return "PAID";
  return paid.greaterThan(0) ? "PARTIALLY_PAID" : "POSTED";
}

/** Posts: receivable debit, SO invoiced quantities, then auto-applies unallocated customer credit. */
export async function postInvoice(ctx: ServiceContext, id: string) {
  requirePermission(ctx, "invoices.post");
  return ctx.db.$transaction(async (tx) => {
    const inv = await lockInvoice(tx, ctx, id);
    if (inv.status !== "DRAFT") throw new AppError("INVALID_TRANSITION", "errors.invalidTransition");
    for (const it of inv.items) {
      if (!it.salesOrderItemId) continue;
      const soi = await tx.salesOrderItem.findUniqueOrThrow({ where: { id: it.salesOrderItemId } });
      if (D(soi.invoicedQuantity).plus(D(it.quantity)).greaterThan(D(soi.quantity))) throw new AppError("CONFLICT", "errors.overInvoice");
      await tx.salesOrderItem.update({ where: { id: soi.id }, data: { invoicedQuantity: { increment: it.quantity } } });
    }
    await postLedger(tx, ctx, { party: { customerId: inv.customerId }, date: inv.invoiceDate, documentType: "CUSTOMER_INVOICE", documentId: inv.id, documentNumber: inv.number, debit: inv.total, description: "Customer invoice" });
    await tx.customerInvoice.update({ where: { id }, data: { status: "POSTED", postedAt: new Date(), postedById: ctx.actor.userId } });
    await autoAllocateCredit(tx, ctx, inv.customerId, inv.salesOrderId);
    await audit(tx, ctx, { action: "invoice.post", entityType: "invoice", entityId: id, entityNumber: inv.number, newValues: { total: inv.total } });
    return tx.customerInvoice.findUniqueOrThrow({ where: { id } });
  });
}

/** Cancels. Posted invoices: ledger reversal, released allocations (payments become credit again). */
export async function cancelInvoice(ctx: ServiceContext, id: string, input: unknown) {
  requirePermission(ctx, "invoices.cancel");
  const { reason } = parse(z.object({ reason: z.string().trim().min(1).max(1000) }), input);
  return ctx.db.$transaction(async (tx) => {
    const inv = await lockInvoice(tx, ctx, id);
    if (inv.status === "CANCELLED") throw new AppError("INVALID_TRANSITION", "errors.invalidTransition");
    if (inv.status !== "DRAFT") {
      await reverseLedger(tx, ctx, inv.id, `Cancel: ${reason}`);
      await tx.customerPaymentAllocation.updateMany({ where: { invoiceId: id, reversedAt: null }, data: { reversedAt: new Date() } });
      for (const it of inv.items) {
        if (it.salesOrderItemId) await tx.salesOrderItem.update({ where: { id: it.salesOrderItemId }, data: { invoicedQuantity: { decrement: it.quantity } } });
      }
    }
    await tx.customerInvoice.update({ where: { id }, data: { status: "CANCELLED", paidAmount: 0, cancelledAt: new Date(), cancelledById: ctx.actor.userId, cancelReason: reason } });
    await audit(tx, ctx, { action: "invoice.cancel", entityType: "invoice", entityId: id, entityNumber: inv.number, oldValues: { status: inv.status }, newValues: { status: "CANCELLED", reason } });
  });
}

// ═════════════════════════ Payments ═════════════════════════

export const paymentSchema = z.object({
  customerId: uuid,
  salesOrderId: uuid.nullable().optional(),
  cashAccountId: uuid,
  amount: z.coerce.number().positive().max(1e11),
  method: z.enum(["CASH", "BANK_TRANSFER", "CARD", "OTHER"]),
  paymentDate: z.coerce.date().optional(),
  reference: optionalText(100),
  notes: optionalText(1000),
  allocations: z.array(z.object({ invoiceId: uuid, amount: z.coerce.number().positive() })).optional(),
});

export const paymentListSchema = listQuerySchema.extend({ customerId: uuid.optional(), salesOrderId: uuid.optional(), status: z.enum(["POSTED", "REVERSED"]).optional(), from: z.coerce.date().optional(), to: z.coerce.date().optional() });

export async function listPayments(ctx: ServiceContext, input: unknown) {
  requirePermission(ctx, "payments.view");
  const q = parse(paymentListSchema, input);
  const a = ctx.actor;
  const scoped =
    a.isSuperAdmin || a.dataScope === "ALL" ? {}
    : a.dataScope === "SHOWROOM" ? { customer: { showroomId: a.showroomId ?? "00000000-0000-0000-0000-000000000000" } }
    : { createdById: a.userId };
  const where = {
    ...scoped,
    ...(q.customerId ? { customerId: q.customerId } : {}),
    ...(q.salesOrderId ? { salesOrderId: q.salesOrderId } : {}),
    ...(q.status ? { status: q.status } : {}),
    ...(q.from || q.to ? { paymentDate: { ...(q.from ? { gte: q.from } : {}), ...(q.to ? { lte: q.to } : {}) } } : {}),
    ...(q.q ? { OR: [{ number: { contains: q.q, mode: "insensitive" as const } }, { reference: { contains: q.q } }, { customer: { name: { contains: q.q, mode: "insensitive" as const } } }] } : {}),
  };
  const [items, total] = await Promise.all([
    ctx.db.customerPayment.findMany({
      where,
      include: { customer: { select: { id: true, name: true } }, salesOrder: { select: { id: true, number: true } }, cashAccount: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
      ...pageArgs(q),
    }),
    ctx.db.customerPayment.count({ where }),
  ]);
  return toPage(items, total, q);
}

export async function getPayment(ctx: ServiceContext, id: string) {
  requirePermission(ctx, "payments.view");
  const p = await ctx.db.customerPayment.findUnique({
    where: { id },
    include: {
      customer: true, salesOrder: { select: { id: true, number: true } }, cashAccount: { select: { id: true, name: true, type: true } },
      allocations: { include: { invoice: { select: { id: true, number: true, total: true } } } },
    },
  });
  if (!p) throw notFound("payment");
  assertInShowroomScope(ctx.actor, { showroomId: p.customer.showroomId, createdById: p.createdById });
  return p;
}

async function applyToInvoice(tx: Tx, ctx: ServiceContext, paymentId: string, invoiceId: string, amount: Dec) {
  await tx.$queryRaw`SELECT id FROM customer_invoices WHERE id = ${invoiceId}::uuid FOR UPDATE`;
  const inv = await tx.customerInvoice.findUniqueOrThrow({ where: { id: invoiceId } });
  if (!["POSTED", "PARTIALLY_PAID"].includes(inv.status)) throw new AppError("CONFLICT", "errors.invoiceNotOpen");
  const open = D(inv.total).minus(D(inv.paidAmount));
  const applied = amount.greaterThan(open) ? open : amount;
  if (applied.lessThanOrEqualTo(0)) return ZERO;
  await tx.customerPaymentAllocation.create({ data: { paymentId, invoiceId, amount: applied, createdById: ctx.actor.userId } });
  const paid = D(inv.paidAmount).plus(applied);
  await tx.customerInvoice.update({ where: { id: invoiceId }, data: { paidAmount: paid, status: invoiceStatus(D(inv.total), paid) } });
  return applied;
}

async function unallocated(tx: Tx, paymentId: string) {
  const p = await tx.customerPayment.findUniqueOrThrow({ where: { id: paymentId } });
  const agg = await tx.customerPaymentAllocation.aggregate({ where: { paymentId, reversedAt: null }, _sum: { amount: true } });
  return D(p.amount).minus(D(agg._sum.amount ?? 0));
}

/** Applies unallocated posted payments to open invoices: same sales order first, then oldest. */
async function autoAllocateCredit(tx: Tx, ctx: ServiceContext, customerId: string, salesOrderId: string | null) {
  const payments = await tx.customerPayment.findMany({ where: { customerId, status: "POSTED" }, orderBy: { paymentDate: "asc" } });
  const invoices = await tx.customerInvoice.findMany({ where: { customerId, status: { in: ["POSTED", "PARTIALLY_PAID"] } }, orderBy: { invoiceDate: "asc" } });
  const ordered = [...invoices.filter((i) => i.salesOrderId === salesOrderId), ...invoices.filter((i) => i.salesOrderId !== salesOrderId)];
  for (const p of payments) {
    let free = await unallocated(tx, p.id);
    // A payment tied to a sales order is only applied to that order's invoices.
    const targets = p.salesOrderId ? ordered.filter((i) => i.salesOrderId === p.salesOrderId) : ordered;
    for (const inv of targets) {
      if (free.lessThanOrEqualTo(0)) break;
      free = free.minus(await applyToInvoice(tx, ctx, p.id, inv.id, free));
    }
  }
}

export async function createPayment(ctx: ServiceContext, input: unknown) {
  requirePermission(ctx, "payments.create");
  const data = parse(paymentSchema, input);
  return ctx.db.$transaction(async (tx) => {
    const customer = await tx.customer.findFirst({ where: { id: data.customerId, deletedAt: null } });
    if (!customer) throw notFound("customer");
    assertInShowroomScope(ctx.actor, customer);
    if (data.salesOrderId) {
      const so = await tx.salesOrder.findUnique({ where: { id: data.salesOrderId } });
      if (!so || so.customerId !== customer.id) throw new AppError("VALIDATION", "errors.validation", [{ path: "salesOrderId", code: "mismatch" }]);
      if (so.status === "CANCELLED") throw new AppError("CONFLICT", "errors.invalidTransition");
    }
    const account = await tx.cashAccount.findUnique({ where: { id: data.cashAccountId } });
    if (!account || account.status !== "ACTIVE") throw new AppError("VALIDATION", "errors.validation", [{ path: "cashAccountId", code: "invalid" }]);
    const date = data.paymentDate ?? new Date();
    const number = await nextNumber(tx, "PAYMENT", date);
    const amount = money(D(data.amount));
    const p = await tx.customerPayment.create({
      data: {
        number, customerId: customer.id, salesOrderId: data.salesOrderId ?? null, cashAccountId: account.id, amount, method: data.method,
        paymentDate: date, reference: data.reference ?? null, notes: data.notes ?? null, createdById: ctx.actor.userId,
      },
    });
    await postLedger(tx, ctx, { party: { customerId: customer.id }, date, documentType: "CUSTOMER_PAYMENT", documentId: p.id, documentNumber: number, credit: amount, description: `Payment ${data.method}` });
    await postCash(tx, ctx, { cashAccountId: account.id, date, direction: "IN", amount, sourceType: "customer_payment", sourceId: p.id, sourceNumber: number, description: customer.name });
    if (data.allocations?.length) {
      const total = sum(data.allocations.map((a) => D(a.amount)));
      if (total.greaterThan(amount)) throw new AppError("VALIDATION", "errors.allocationExceeds");
      for (const a of data.allocations) {
        const inv = await tx.customerInvoice.findUnique({ where: { id: a.invoiceId } });
        if (!inv || inv.customerId !== customer.id) throw new AppError("VALIDATION", "errors.validation", [{ path: "allocations", code: "mismatch" }]);
        await applyToInvoice(tx, ctx, p.id, a.invoiceId, D(a.amount));
      }
    } else {
      await autoAllocateCredit(tx, ctx, customer.id, data.salesOrderId ?? null);
    }
    await audit(tx, ctx, { action: "payment.create", entityType: "payment", entityId: p.id, entityNumber: number, newValues: { amount, method: data.method, customer: customer.code } });
    return p;
  });
}

export async function reversePayment(ctx: ServiceContext, id: string, input: unknown) {
  requirePermission(ctx, "payments.reverse");
  const { reason } = parse(z.object({ reason: z.string().trim().min(1).max(1000) }), input);
  return ctx.db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM customer_payments WHERE id = ${id}::uuid FOR UPDATE`;
    const p = await tx.customerPayment.findUnique({ where: { id }, include: { allocations: { where: { reversedAt: null } }, customer: true } });
    if (!p) throw notFound("payment");
    assertInShowroomScope(ctx.actor, { showroomId: p.customer.showroomId, createdById: p.createdById });
    if (p.status !== "POSTED") throw new AppError("INVALID_TRANSITION", "errors.invalidTransition");
    for (const a of p.allocations) {
      await tx.$queryRaw`SELECT id FROM customer_invoices WHERE id = ${a.invoiceId}::uuid FOR UPDATE`;
      const inv = await tx.customerInvoice.findUniqueOrThrow({ where: { id: a.invoiceId } });
      const paid = D(inv.paidAmount).minus(D(a.amount));
      await tx.customerInvoice.update({ where: { id: inv.id }, data: { paidAmount: paid, status: inv.status === "CANCELLED" ? "CANCELLED" : invoiceStatus(D(inv.total), paid) } });
    }
    await tx.customerPaymentAllocation.updateMany({ where: { paymentId: id, reversedAt: null }, data: { reversedAt: new Date() } });
    await reverseLedger(tx, ctx, id, `Reversal: ${reason}`);
    await reverseCash(tx, ctx, id, `Reversal: ${reason}`);
    await tx.customerPayment.update({ where: { id }, data: { status: "REVERSED", reversedAt: new Date(), reversedById: ctx.actor.userId, reverseReason: reason } });
    await audit(tx, ctx, { action: "payment.reverse", entityType: "payment", entityId: id, entityNumber: p.number, oldValues: { status: "POSTED" }, newValues: { status: "REVERSED", reason } });
  });
}

/** Receivables statement for a customer with running balance. */
export async function customerStatement(ctx: ServiceContext, customerId: string) {
  requirePermission(ctx, "payments.view");
  const c = await ctx.db.customer.findUnique({ where: { id: customerId } });
  if (!c) throw notFound("customer");
  assertInShowroomScope(ctx.actor, c);
  const rows = await ctx.db.partyLedgerEntry.findMany({ where: { customerId }, orderBy: [{ entryDate: "asc" }, { createdAt: "asc" }] });
  let running = ZERO;
  return rows.map((r) => {
    running = running.plus(D(r.debit)).minus(D(r.credit));
    return { ...r, balance: running };
  });
}
