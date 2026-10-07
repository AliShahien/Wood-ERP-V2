import { z } from "zod";
import type { Tx } from "@edge/db";
import { assertWarehouseAccess, can, requirePermission, type ServiceContext } from "../context";
import { AppError, notFound } from "../errors";
import { audit } from "../platform/audit";
import { postStock, reverseStock } from "../platform/inventory";
import { postCash, postLedger, reverseCash, reverseLedger } from "../platform/ledger";
import { D, money, sum, ZERO } from "../platform/money";
import { nextNumber } from "../platform/numbering";
import { listQuerySchema, pageArgs, toPage } from "../platform/pagination";
import { assertTransition, PURCHASE_ORDER_TRANSITIONS } from "../platform/state-machine";
import { optionalText, parse, uuid } from "../validation";
import { computeTotals } from "./pricing";
import { readSettings } from "./settings";
import { notify } from "./notifications";

const qty = z.coerce.number().positive().max(1e9);
const price = z.coerce.number().min(0).max(1e10);

// ═════════════════════ Purchase requests ═════════════════════

export const prSchema = z.object({
  requiredDate: z.coerce.date().nullable().optional(),
  reason: optionalText(500),
  notes: optionalText(1000),
  items: z.array(z.object({ materialId: uuid, quantity: qty, notes: optionalText(300) })).min(1).max(200),
});

export async function listPurchaseRequests(ctx: ServiceContext, input: unknown) {
  requirePermission(ctx, "purchases.view");
  const q = parse(listQuerySchema.extend({ status: z.enum(["DRAFT", "SUBMITTED", "APPROVED", "REJECTED", "ORDERED", "CANCELLED"]).optional() }), input);
  const where = { ...(q.status ? { status: q.status } : {}), ...(q.q ? { number: { contains: q.q, mode: "insensitive" as const } } : {}) };
  const [items, total] = await Promise.all([
    ctx.db.purchaseRequest.findMany({ where, include: { _count: { select: { items: true } } }, orderBy: { createdAt: "desc" }, ...pageArgs(q) }),
    ctx.db.purchaseRequest.count({ where }),
  ]);
  return toPage(items, total, q);
}

export async function getPurchaseRequest(ctx: ServiceContext, id: string) {
  requirePermission(ctx, "purchases.view");
  const pr = await ctx.db.purchaseRequest.findUnique({ where: { id }, include: { items: { include: { material: { select: { id: true, code: true, name: true, unit: { select: { name: true } }, defaultSupplierId: true, lastPurchaseCost: true } } } }, purchaseOrders: { select: { id: true, number: true, status: true } } } });
  if (!pr) throw notFound("purchase_request");
  return pr;
}

export async function createPurchaseRequest(ctx: ServiceContext, input: unknown) {
  requirePermission(ctx, "purchases.create");
  const data = parse(prSchema, input);
  return ctx.db.$transaction(async (tx) => {
    const number = await nextNumber(tx, "PURCHASE_REQUEST");
    const pr = await tx.purchaseRequest.create({
      data: { number, requestDate: new Date(), requiredDate: data.requiredDate ?? null, reason: data.reason, notes: data.notes, createdById: ctx.actor.userId, items: { create: data.items.map((i) => ({ materialId: i.materialId, quantity: i.quantity, notes: i.notes ?? null })) } },
    });
    await audit(tx, ctx, { action: "purchase_request.create", entityType: "purchase_request", entityId: pr.id, entityNumber: number });
    return pr;
  });
}

const PR_FLOW: Record<string, string[]> = { DRAFT: ["SUBMITTED", "CANCELLED"], SUBMITTED: ["APPROVED", "REJECTED", "CANCELLED"], APPROVED: ["ORDERED", "CANCELLED"] };

export async function transitionPurchaseRequest(ctx: ServiceContext, id: string, to: "SUBMITTED" | "APPROVED" | "REJECTED" | "CANCELLED") {
  requirePermission(ctx, to === "SUBMITTED" ? "purchases.create" : to === "CANCELLED" ? "purchases.cancel" : "purchases.approve");
  return ctx.db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM purchase_requests WHERE id = ${id}::uuid FOR UPDATE`;
    const pr = await tx.purchaseRequest.findUnique({ where: { id } });
    if (!pr) throw notFound("purchase_request");
    if (!PR_FLOW[pr.status]?.includes(to)) throw new AppError("INVALID_TRANSITION", "errors.invalidTransition");
    const u = await tx.purchaseRequest.update({ where: { id }, data: { status: to, updatedById: ctx.actor.userId, ...(to === "APPROVED" ? { approvedAt: new Date(), approvedById: ctx.actor.userId } : {}) } });
    await audit(tx, ctx, { action: `purchase_request.${to.toLowerCase()}`, entityType: "purchase_request", entityId: id, entityNumber: pr.number, oldValues: { status: pr.status }, newValues: { status: to } });
    return u;
  });
}

// ═════════════════════ Purchase orders ═════════════════════

export const poSchema = z.object({
  supplierId: uuid,
  warehouseId: uuid,
  purchaseRequestId: uuid.nullable().optional(),
  orderDate: z.coerce.date().optional(),
  expectedDate: z.coerce.date().nullable().optional(),
  taxEnabled: z.boolean().optional(),
  taxRate: z.coerce.number().min(0).max(100).optional(),
  paymentTerms: optionalText(500),
  notes: optionalText(2000),
  items: z.array(z.object({ materialId: uuid, quantity: qty, unitPrice: price, discount: price.default(0), notes: optionalText(300) })).min(1).max(300),
});

async function poTotals(ctx: ServiceContext, data: z.infer<typeof poSchema>) {
  const s = await readSettings(ctx.db);
  const taxEnabled = data.taxEnabled ?? s["finance.taxEnabledByDefault"];
  const taxRate = taxEnabled ? (data.taxRate ?? s["finance.defaultTaxRate"]) : 0;
  try {
    const totals = computeTotals({ lines: data.items, discountType: "AMOUNT", discountValue: 0, taxEnabled, taxRate });
    return { totals, taxEnabled, taxRate, currency: s["finance.currency"] };
  } catch {
    throw new AppError("VALIDATION", "errors.discountTooLarge", [{ path: "items", code: "range" }]);
  }
}

export const poListSchema = listQuerySchema.extend({
  status: z.enum(["DRAFT", "SUBMITTED", "APPROVED", "PARTIALLY_RECEIVED", "RECEIVED", "CLOSED", "CANCELLED"]).optional(),
  supplierId: uuid.optional(),
});

export async function listPurchaseOrders(ctx: ServiceContext, input: unknown) {
  requirePermission(ctx, "purchases.view");
  const q = parse(poListSchema, input);
  const where = {
    ...(q.status ? { status: q.status } : {}),
    ...(q.supplierId ? { supplierId: q.supplierId } : {}),
    ...(q.q ? { OR: [{ number: { contains: q.q, mode: "insensitive" as const } }, { supplier: { name: { contains: q.q, mode: "insensitive" as const } } }] } : {}),
  };
  const [items, total] = await Promise.all([
    ctx.db.purchaseOrder.findMany({ where, include: { supplier: { select: { id: true, name: true } }, warehouse: { select: { name: true } } }, orderBy: { createdAt: "desc" }, ...pageArgs(q) }),
    ctx.db.purchaseOrder.count({ where }),
  ]);
  return toPage(items, total, q);
}

export async function getPurchaseOrder(ctx: ServiceContext, id: string) {
  requirePermission(ctx, "purchases.view");
  const po = await ctx.db.purchaseOrder.findUnique({
    where: { id },
    include: {
      supplier: true, warehouse: { select: { id: true, code: true, name: true } }, purchaseRequest: { select: { id: true, number: true } },
      items: { orderBy: { lineNo: "asc" }, include: { material: { select: { id: true, code: true, name: true, unit: { select: { name: true } } } } } },
      goodsReceipts: { select: { id: true, number: true, status: true, receiptDate: true } },
      supplierInvoices: { select: { id: true, number: true, status: true, total: true } },
    },
  });
  if (!po) throw notFound("purchase_order");
  return po;
}

export async function createPurchaseOrder(ctx: ServiceContext, input: unknown) {
  requirePermission(ctx, "purchases.create");
  const data = parse(poSchema, input);
  const { totals, taxEnabled, taxRate, currency } = await poTotals(ctx, data);
  return ctx.db.$transaction(async (tx) => {
    const supplier = await tx.supplier.findFirst({ where: { id: data.supplierId, deletedAt: null, status: "ACTIVE" } });
    if (!supplier) throw new AppError("VALIDATION", "errors.validation", [{ path: "supplierId", code: "inactive" }]);
    const date = data.orderDate ?? new Date();
    const number = await nextNumber(tx, "PURCHASE_ORDER", date);
    const po = await tx.purchaseOrder.create({
      data: {
        number, supplierId: data.supplierId, warehouseId: data.warehouseId, purchaseRequestId: data.purchaseRequestId ?? null, orderDate: date,
        expectedDate: data.expectedDate ?? null, currency, subtotal: totals.subtotal, taxEnabled, taxRate, taxTotal: totals.taxTotal, total: totals.total,
        paymentTerms: data.paymentTerms, notes: data.notes, createdById: ctx.actor.userId,
        items: { create: data.items.map((i, idx) => ({ lineNo: idx + 1, materialId: i.materialId, quantity: i.quantity, unitPrice: i.unitPrice, discount: i.discount, lineTotal: totals.lineTotals[idx]!, notes: i.notes ?? null })) },
      },
    });
    if (data.purchaseRequestId) await tx.purchaseRequest.updateMany({ where: { id: data.purchaseRequestId, status: "APPROVED" }, data: { status: "ORDERED" } });
    await audit(tx, ctx, { action: "purchase_order.create", entityType: "purchase_order", entityId: po.id, entityNumber: number, newValues: { supplier: supplier.code, total: po.total } });
    return po;
  });
}

export async function updatePurchaseOrder(ctx: ServiceContext, id: string, input: unknown) {
  requirePermission(ctx, "purchases.create");
  const data = parse(poSchema, input);
  const { totals, taxEnabled, taxRate } = await poTotals(ctx, data);
  return ctx.db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM purchase_orders WHERE id = ${id}::uuid FOR UPDATE`;
    const po = await tx.purchaseOrder.findUnique({ where: { id } });
    if (!po) throw notFound("purchase_order");
    if (po.status !== "DRAFT") throw new AppError("IMMUTABLE", "errors.immutable");
    await tx.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: id } });
    const u = await tx.purchaseOrder.update({
      where: { id },
      data: {
        supplierId: data.supplierId, warehouseId: data.warehouseId, expectedDate: data.expectedDate ?? null, subtotal: totals.subtotal, taxEnabled, taxRate,
        taxTotal: totals.taxTotal, total: totals.total, paymentTerms: data.paymentTerms, notes: data.notes, updatedById: ctx.actor.userId,
        items: { create: data.items.map((i, idx) => ({ lineNo: idx + 1, materialId: i.materialId, quantity: i.quantity, unitPrice: i.unitPrice, discount: i.discount, lineTotal: totals.lineTotals[idx]!, notes: i.notes ?? null })) },
      },
    });
    await audit(tx, ctx, { action: "purchase_order.update", entityType: "purchase_order", entityId: id, entityNumber: po.number, oldValues: { total: po.total }, newValues: { total: u.total } });
    return u;
  });
}

type PoStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "PARTIALLY_RECEIVED" | "RECEIVED" | "CLOSED" | "CANCELLED";

export async function transitionPurchaseOrder(ctx: ServiceContext, id: string, to: "SUBMITTED" | "APPROVED" | "DRAFT" | "CANCELLED" | "CLOSED", input: unknown = {}) {
  requirePermission(ctx, to === "SUBMITTED" ? "purchases.create" : to === "CANCELLED" ? "purchases.cancel" : "purchases.approve");
  const { reason } = parse(z.object({ reason: z.string().trim().max(500).optional().nullable() }), input);
  return ctx.db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM purchase_orders WHERE id = ${id}::uuid FOR UPDATE`;
    const po = await tx.purchaseOrder.findUnique({ where: { id } });
    if (!po) throw notFound("purchase_order");
    assertTransition("purchase_order", PURCHASE_ORDER_TRANSITIONS, po.status as PoStatus, to);
    if (to === "CANCELLED" && (await tx.goodsReceipt.count({ where: { purchaseOrderId: id, status: "POSTED" } }))) throw new AppError("CONFLICT", "errors.poHasReceipts");
    const u = await tx.purchaseOrder.update({
      where: { id },
      data: {
        status: to, updatedById: ctx.actor.userId,
        ...(to === "SUBMITTED" ? { submittedAt: new Date() } : {}),
        ...(to === "APPROVED" ? { approvedAt: new Date(), approvedById: ctx.actor.userId } : {}),
        ...(to === "CANCELLED" ? { cancelledAt: new Date(), cancelReason: reason ?? null } : {}),
      },
    });
    if (to === "SUBMITTED") await notify(tx, { type: "purchase_pending", permission: "purchases.approve", params: { number: po.number }, entityType: "purchase_order", entityId: id, dedupeKey: `po_pending:${id}:${Date.now()}`, excludeUserId: ctx.actor.userId });
    await audit(tx, ctx, { action: `purchase_order.${to.toLowerCase()}`, entityType: "purchase_order", entityId: id, entityNumber: po.number, oldValues: { status: po.status }, newValues: { status: to, reason } });
    return u;
  });
}

// ═════════════════════ Goods receipts ═════════════════════

export const grSchema = z.object({
  purchaseOrderId: uuid.nullable().optional(),
  supplierId: uuid.optional(),
  warehouseId: uuid.optional(),
  receiptDate: z.coerce.date().optional(),
  supplierDocNo: optionalText(60),
  notes: optionalText(1000),
  items: z.array(z.object({ purchaseOrderItemId: uuid.nullable().optional(), materialId: uuid.optional(), quantity: qty, unitCost: price.optional() })).max(300).optional(),
});

/** Drafts a receipt. From a PO: defaults to remaining quantities at PO net unit price. */
export async function createGoodsReceipt(ctx: ServiceContext, input: unknown) {
  requirePermission(ctx, "goods_receipts.create");
  const data = parse(grSchema, input);
  return ctx.db.$transaction(async (tx) => {
    let supplierId = data.supplierId;
    let warehouseId = data.warehouseId;
    let lines: { purchaseOrderItemId: string | null; materialId: string; quantity: number; unitCost: number }[] = [];
    if (data.purchaseOrderId) {
      const po = await tx.purchaseOrder.findUnique({ where: { id: data.purchaseOrderId }, include: { items: true } });
      if (!po) throw notFound("purchase_order");
      if (!["APPROVED", "PARTIALLY_RECEIVED"].includes(po.status)) throw new AppError("INVALID_TRANSITION", "errors.poNotApproved");
      supplierId = po.supplierId;
      warehouseId = data.warehouseId ?? po.warehouseId;
      const netUnit = (i: (typeof po.items)[number]) => money(D(i.lineTotal).div(D(i.quantity))).toNumber();
      if (data.items?.length) {
        lines = data.items.map((l) => {
          const pi = po.items.find((x) => x.id === l.purchaseOrderItemId);
          if (!pi) throw new AppError("VALIDATION", "errors.validation", [{ path: "items", code: "po_item" }]);
          return { purchaseOrderItemId: pi.id, materialId: pi.materialId, quantity: l.quantity, unitCost: l.unitCost ?? netUnit(pi) };
        });
      } else {
        lines = po.items
          .map((pi) => ({ purchaseOrderItemId: pi.id, materialId: pi.materialId, quantity: D(pi.quantity).minus(D(pi.receivedQuantity)).toNumber(), unitCost: netUnit(pi) }))
          .filter((l) => l.quantity > 0);
      }
    } else {
      if (!supplierId || !warehouseId || !data.items?.length) throw new AppError("VALIDATION", "errors.validation", [{ path: "items", code: "required" }]);
      lines = data.items.map((l) => {
        if (!l.materialId || l.unitCost === undefined) throw new AppError("VALIDATION", "errors.unitCostRequired", [{ path: "items", code: "required" }]);
        return { purchaseOrderItemId: null, materialId: l.materialId, quantity: l.quantity, unitCost: l.unitCost };
      });
    }
    if (!lines.length) throw new AppError("VALIDATION", "errors.nothingToReceive");
    assertWarehouseAccess(ctx.actor, warehouseId!);
    const date = data.receiptDate ?? new Date();
    const number = await nextNumber(tx, "GOODS_RECEIPT", date);
    const gr = await tx.goodsReceipt.create({
      data: {
        number, purchaseOrderId: data.purchaseOrderId ?? null, supplierId: supplierId!, warehouseId: warehouseId!, receiptDate: date, supplierDocNo: data.supplierDocNo, notes: data.notes, createdById: ctx.actor.userId,
        items: { create: lines.map((l) => ({ purchaseOrderItemId: l.purchaseOrderItemId, materialId: l.materialId, quantity: l.quantity, unitCost: l.unitCost, lineTotal: money(D(l.quantity).times(l.unitCost)) })) },
      },
    });
    await audit(tx, ctx, { action: "goods_receipt.create", entityType: "goods_receipt", entityId: gr.id, entityNumber: number, newValues: { lines: lines.length } });
    return gr;
  });
}

async function refreshPoReceipt(tx: Tx, poId: string) {
  const po = await tx.purchaseOrder.findUniqueOrThrow({ where: { id: poId }, include: { items: true } });
  if (!["APPROVED", "PARTIALLY_RECEIVED", "RECEIVED"].includes(po.status)) return;
  const full = po.items.every((i) => D(i.receivedQuantity).greaterThanOrEqualTo(D(i.quantity)));
  const any = po.items.some((i) => D(i.receivedQuantity).greaterThan(0));
  const status = full ? "RECEIVED" : any ? "PARTIALLY_RECEIVED" : "APPROVED";
  if (status !== po.status) await tx.purchaseOrder.update({ where: { id: poId }, data: { status } });
}

/** Posts: stock IN at receipt cost (moving average updated), PO received quantities, status. */
export async function postGoodsReceipt(ctx: ServiceContext, id: string) {
  requirePermission(ctx, "goods_receipts.post");
  return ctx.db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM goods_receipts WHERE id = ${id}::uuid FOR UPDATE`;
    const gr = await tx.goodsReceipt.findUnique({ where: { id }, include: { items: true } });
    if (!gr) throw notFound("goods_receipt");
    if (gr.status !== "DRAFT") throw new AppError("INVALID_TRANSITION", "errors.invalidTransition");
    assertWarehouseAccess(ctx.actor, gr.warehouseId);
    if (gr.purchaseOrderId) {
      await tx.$queryRaw`SELECT id FROM purchase_orders WHERE id = ${gr.purchaseOrderId}::uuid FOR UPDATE`;
      const po = await tx.purchaseOrder.findUniqueOrThrow({ where: { id: gr.purchaseOrderId }, include: { items: true } });
      if (!["APPROVED", "PARTIALLY_RECEIVED"].includes(po.status)) throw new AppError("INVALID_TRANSITION", "errors.poNotApproved");
      for (const it of gr.items) {
        const pi = po.items.find((x) => x.id === it.purchaseOrderItemId);
        if (!pi) continue;
        if (D(pi.receivedQuantity).plus(D(it.quantity)).greaterThan(D(pi.quantity))) throw new AppError("VALIDATION", "errors.overReceipt", [{ path: "items", code: "range" }]);
        await tx.purchaseOrderItem.update({ where: { id: pi.id }, data: { receivedQuantity: { increment: it.quantity } } });
      }
    }
    await postStock(tx, ctx, { type: "goods_receipt", id: gr.id, number: gr.number, date: gr.receiptDate },
      gr.items.map((i) => ({ materialId: i.materialId, warehouseId: gr.warehouseId, quantity: i.quantity, unitCost: i.unitCost, type: "PURCHASE_RECEIPT" as const })));
    const posted = await tx.goodsReceipt.update({ where: { id }, data: { status: "POSTED", postedAt: new Date(), postedById: ctx.actor.userId } });
    if (gr.purchaseOrderId) await refreshPoReceipt(tx, gr.purchaseOrderId);
    await audit(tx, ctx, { action: "goods_receipt.post", entityType: "goods_receipt", entityId: id, entityNumber: gr.number, newValues: { value: sum(gr.items.map((i) => D(i.lineTotal))) } });
    return posted;
  });
}

/** Reversal is only possible while the received stock is still on hand (never goes negative). */
export async function reverseGoodsReceipt(ctx: ServiceContext, id: string, input: unknown) {
  requirePermission(ctx, "goods_receipts.reverse");
  const { reason } = parse(z.object({ reason: z.string().trim().min(1).max(500) }), input);
  return ctx.db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM goods_receipts WHERE id = ${id}::uuid FOR UPDATE`;
    const gr = await tx.goodsReceipt.findUnique({ where: { id }, include: { items: true } });
    if (!gr) throw notFound("goods_receipt");
    if (gr.status !== "POSTED") throw new AppError("INVALID_TRANSITION", "errors.invalidTransition");
    await reverseStock(tx, ctx, { type: "goods_receipt", id, number: gr.number, date: new Date() }, reason);
    for (const it of gr.items) if (it.purchaseOrderItemId) await tx.purchaseOrderItem.update({ where: { id: it.purchaseOrderItemId }, data: { receivedQuantity: { decrement: it.quantity } } });
    await tx.goodsReceipt.update({ where: { id }, data: { status: "REVERSED", reversedAt: new Date(), reversedById: ctx.actor.userId, reverseReason: reason } });
    if (gr.purchaseOrderId) await refreshPoReceipt(tx, gr.purchaseOrderId);
    await audit(tx, ctx, { action: "goods_receipt.reverse", entityType: "goods_receipt", entityId: id, entityNumber: gr.number, newValues: { reason } });
  });
}

export async function listGoodsReceipts(ctx: ServiceContext, input: unknown) {
  requirePermission(ctx, "goods_receipts.view");
  const q = parse(listQuerySchema.extend({ status: z.enum(["DRAFT", "POSTED", "CANCELLED", "REVERSED"]).optional(), supplierId: uuid.optional() }), input);
  const where = {
    ...(q.status ? { status: q.status } : {}),
    ...(q.supplierId ? { supplierId: q.supplierId } : {}),
    ...(q.q ? { OR: [{ number: { contains: q.q, mode: "insensitive" as const } }, { supplier: { name: { contains: q.q, mode: "insensitive" as const } } }, { supplierDocNo: { contains: q.q } }] } : {}),
  };
  const [items, total] = await Promise.all([
    ctx.db.goodsReceipt.findMany({ where, include: { supplier: { select: { name: true } }, warehouse: { select: { name: true } }, purchaseOrder: { select: { id: true, number: true } }, _count: { select: { items: true } } }, orderBy: { createdAt: "desc" }, ...pageArgs(q) }),
    ctx.db.goodsReceipt.count({ where }),
  ]);
  return toPage(items, total, q);
}

export async function getGoodsReceipt(ctx: ServiceContext, id: string) {
  requirePermission(ctx, "goods_receipts.view");
  const gr = await ctx.db.goodsReceipt.findUnique({
    where: { id },
    include: { supplier: true, warehouse: true, purchaseOrder: { select: { id: true, number: true } }, items: { include: { material: { select: { code: true, name: true, unit: { select: { name: true } } } } } } },
  });
  if (!gr) throw notFound("goods_receipt");
  if (!can(ctx.actor, "costing.view") && !can(ctx.actor, "purchases.view")) return { ...gr, items: gr.items.map((i) => ({ ...i, unitCost: null, lineTotal: null })) };
  return gr;
}

// ═════════════════════ Supplier invoices ═════════════════════

export const supplierInvoiceSchema = z.object({
  supplierId: uuid,
  purchaseOrderId: uuid.nullable().optional(),
  supplierInvoiceNo: optionalText(60),
  invoiceDate: z.coerce.date().optional(),
  dueDate: z.coerce.date().nullable().optional(),
  taxEnabled: z.boolean().optional(),
  taxRate: z.coerce.number().min(0).max(100).optional(),
  notes: optionalText(1000),
  items: z.array(z.object({ materialId: uuid.nullable().optional(), description: z.string().trim().min(1).max(300), quantity: qty, unitPrice: price, discount: price.default(0) })).min(1).max(300),
});

export async function createSupplierInvoice(ctx: ServiceContext, input: unknown) {
  requirePermission(ctx, "supplier_invoices.create");
  const data = parse(supplierInvoiceSchema, input);
  const s = await readSettings(ctx.db);
  const taxEnabled = data.taxEnabled ?? s["finance.taxEnabledByDefault"];
  const taxRate = taxEnabled ? (data.taxRate ?? s["finance.defaultTaxRate"]) : 0;
  const totals = computeTotals({ lines: data.items, discountType: "AMOUNT", discountValue: 0, taxEnabled, taxRate });
  return ctx.db.$transaction(async (tx) => {
    // Supplier invoice numbers are unique per supplier (also after cancellation — prevents double booking).
    if (data.supplierInvoiceNo && (await tx.supplierInvoice.findFirst({ where: { supplierId: data.supplierId, supplierInvoiceNo: data.supplierInvoiceNo } }))) {
      throw new AppError("CONFLICT", "errors.duplicateSupplierInvoice");
    }
    const date = data.invoiceDate ?? new Date();
    const number = await nextNumber(tx, "SUPPLIER_INVOICE", date);
    const inv = await tx.supplierInvoice.create({
      data: {
        number, supplierId: data.supplierId, purchaseOrderId: data.purchaseOrderId ?? null, supplierInvoiceNo: data.supplierInvoiceNo ?? null, invoiceDate: date, dueDate: data.dueDate ?? null,
        currency: s["finance.currency"], subtotal: totals.subtotal, taxEnabled, taxRate, taxTotal: totals.taxTotal, total: totals.total, notes: data.notes, createdById: ctx.actor.userId,
        items: { create: data.items.map((i, idx) => ({ lineNo: idx + 1, materialId: i.materialId ?? null, description: i.description, quantity: i.quantity, unitPrice: i.unitPrice, discount: i.discount, lineTotal: totals.lineTotals[idx]! })) },
      },
    });
    await audit(tx, ctx, { action: "supplier_invoice.create", entityType: "supplier_invoice", entityId: inv.id, entityNumber: number, newValues: { total: inv.total } });
    return inv;
  });
}

/** Prefills a supplier invoice from what was received (net) on a purchase order. */
export async function invoiceDraftFromPo(ctx: ServiceContext, poId: string) {
  requirePermission(ctx, "supplier_invoices.create");
  const po = await getPurchaseOrder(ctx, poId);
  return {
    supplierId: po.supplierId, purchaseOrderId: po.id, taxEnabled: po.taxEnabled, taxRate: Number(po.taxRate),
    items: po.items.filter((i) => Number(i.receivedQuantity) > 0).map((i) => ({
      materialId: i.materialId, description: `${i.material.name} (${i.material.code})`, quantity: Number(i.receivedQuantity),
      unitPrice: Number(i.unitPrice), discount: Number(money(D(i.discount).times(D(i.receivedQuantity)).div(D(i.quantity)))),
    })),
  };
}

export async function postSupplierInvoice(ctx: ServiceContext, id: string) {
  requirePermission(ctx, "supplier_invoices.post");
  return ctx.db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM supplier_invoices WHERE id = ${id}::uuid FOR UPDATE`;
    const inv = await tx.supplierInvoice.findUnique({ where: { id } });
    if (!inv) throw notFound("supplier_invoice");
    if (inv.status !== "DRAFT") throw new AppError("INVALID_TRANSITION", "errors.invalidTransition");
    await postLedger(tx, ctx, { party: { supplierId: inv.supplierId }, date: inv.invoiceDate, documentType: "SUPPLIER_INVOICE", documentId: inv.id, documentNumber: inv.number, credit: inv.total, description: inv.supplierInvoiceNo ?? undefined });
    const u = await tx.supplierInvoice.update({ where: { id }, data: { status: "POSTED", postedAt: new Date(), postedById: ctx.actor.userId } });
    await audit(tx, ctx, { action: "supplier_invoice.post", entityType: "supplier_invoice", entityId: id, entityNumber: inv.number, newValues: { total: inv.total } });
    return u;
  });
}

export async function cancelSupplierInvoice(ctx: ServiceContext, id: string, input: unknown) {
  requirePermission(ctx, "supplier_invoices.cancel");
  const { reason } = parse(z.object({ reason: z.string().trim().min(1).max(500) }), input);
  return ctx.db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM supplier_invoices WHERE id = ${id}::uuid FOR UPDATE`;
    const inv = await tx.supplierInvoice.findUnique({ where: { id } });
    if (!inv) throw notFound("supplier_invoice");
    if (inv.status === "CANCELLED") throw new AppError("INVALID_TRANSITION", "errors.invalidTransition");
    if (D(inv.paidAmount).greaterThan(0)) throw new AppError("CONFLICT", "errors.invoiceHasPayments");
    if (inv.status !== "DRAFT") await reverseLedger(tx, ctx, id, `Cancel: ${reason}`);
    await tx.supplierInvoice.update({ where: { id }, data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: reason } });
    await audit(tx, ctx, { action: "supplier_invoice.cancel", entityType: "supplier_invoice", entityId: id, entityNumber: inv.number, newValues: { reason } });
  });
}

export async function listSupplierInvoices(ctx: ServiceContext, input: unknown) {
  requirePermission(ctx, "supplier_invoices.view");
  const q = parse(listQuerySchema.extend({ status: z.enum(["DRAFT", "POSTED", "PARTIALLY_PAID", "PAID", "CANCELLED"]).optional(), supplierId: uuid.optional(), due: z.enum(["1"]).optional() }), input);
  const where = {
    ...(q.status ? { status: q.status } : {}),
    ...(q.supplierId ? { supplierId: q.supplierId } : {}),
    ...(q.due ? { status: { in: ["POSTED" as const, "PARTIALLY_PAID" as const] }, dueDate: { lte: new Date(Date.now() + 7 * 86400_000) } } : {}),
    ...(q.q ? { OR: [{ number: { contains: q.q, mode: "insensitive" as const } }, { supplierInvoiceNo: { contains: q.q } }, { supplier: { name: { contains: q.q, mode: "insensitive" as const } } }] } : {}),
  };
  const [items, total] = await Promise.all([
    ctx.db.supplierInvoice.findMany({ where, include: { supplier: { select: { id: true, name: true } }, purchaseOrder: { select: { id: true, number: true } } }, orderBy: { createdAt: "desc" }, ...pageArgs(q) }),
    ctx.db.supplierInvoice.count({ where }),
  ]);
  return toPage(items, total, q);
}

export async function getSupplierInvoice(ctx: ServiceContext, id: string) {
  requirePermission(ctx, "supplier_invoices.view");
  const inv = await ctx.db.supplierInvoice.findUnique({ where: { id }, include: { supplier: true, purchaseOrder: { select: { id: true, number: true } }, items: { orderBy: { lineNo: "asc" } }, payments: { select: { id: true, number: true, amount: true, status: true, paymentDate: true } } } });
  if (!inv) throw notFound("supplier_invoice");
  return inv;
}

// ═════════════════════ Supplier payments ═════════════════════

export const supplierPaymentSchema = z.object({
  supplierId: uuid,
  supplierInvoiceId: uuid.nullable().optional(),
  cashAccountId: uuid,
  amount: z.coerce.number().positive().max(1e11),
  method: z.enum(["CASH", "BANK_TRANSFER", "CARD", "OTHER"]),
  paymentDate: z.coerce.date().optional(),
  reference: optionalText(100),
  notes: optionalText(1000),
});

function invStatus(total: ReturnType<typeof D>, paid: ReturnType<typeof D>) {
  return paid.greaterThanOrEqualTo(total) ? "PAID" : paid.greaterThan(0) ? "PARTIALLY_PAID" : "POSTED";
}

export async function createSupplierPayment(ctx: ServiceContext, input: unknown) {
  requirePermission(ctx, "supplier_payments.create");
  const data = parse(supplierPaymentSchema, input);
  return ctx.db.$transaction(async (tx) => {
    const supplier = await tx.supplier.findFirst({ where: { id: data.supplierId, deletedAt: null } });
    if (!supplier) throw notFound("supplier");
    const account = await tx.cashAccount.findUnique({ where: { id: data.cashAccountId } });
    if (!account || account.status !== "ACTIVE") throw new AppError("VALIDATION", "errors.validation", [{ path: "cashAccountId", code: "invalid" }]);
    const amount = money(D(data.amount));
    if (data.supplierInvoiceId) {
      await tx.$queryRaw`SELECT id FROM supplier_invoices WHERE id = ${data.supplierInvoiceId}::uuid FOR UPDATE`;
      const inv = await tx.supplierInvoice.findUnique({ where: { id: data.supplierInvoiceId } });
      if (!inv || inv.supplierId !== supplier.id) throw new AppError("VALIDATION", "errors.validation", [{ path: "supplierInvoiceId", code: "mismatch" }]);
      if (!["POSTED", "PARTIALLY_PAID"].includes(inv.status)) throw new AppError("CONFLICT", "errors.invoiceNotOpen");
      const remaining = D(inv.total).minus(D(inv.paidAmount));
      if (amount.greaterThan(remaining)) throw new AppError("VALIDATION", "errors.overpayment", { remaining: remaining.toString() });
      const paid = D(inv.paidAmount).plus(amount);
      await tx.supplierInvoice.update({ where: { id: inv.id }, data: { paidAmount: paid, status: invStatus(D(inv.total), paid) } });
    }
    const date = data.paymentDate ?? new Date();
    const number = await nextNumber(tx, "SUPPLIER_PAYMENT", date);
    const p = await tx.supplierPayment.create({
      data: { number, supplierId: supplier.id, supplierInvoiceId: data.supplierInvoiceId ?? null, cashAccountId: account.id, amount, method: data.method, paymentDate: date, reference: data.reference ?? null, notes: data.notes ?? null, createdById: ctx.actor.userId },
    });
    await postLedger(tx, ctx, { party: { supplierId: supplier.id }, date, documentType: "SUPPLIER_PAYMENT", documentId: p.id, documentNumber: number, debit: amount, description: `Payment ${data.method}` });
    await postCash(tx, ctx, { cashAccountId: account.id, date, direction: "OUT", amount, sourceType: "supplier_payment", sourceId: p.id, sourceNumber: number, description: supplier.name });
    await audit(tx, ctx, { action: "supplier_payment.create", entityType: "supplier_payment", entityId: p.id, entityNumber: number, newValues: { amount, supplier: supplier.code } });
    return p;
  });
}

export async function reverseSupplierPayment(ctx: ServiceContext, id: string, input: unknown) {
  requirePermission(ctx, "supplier_payments.reverse");
  const { reason } = parse(z.object({ reason: z.string().trim().min(1).max(500) }), input);
  return ctx.db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM supplier_payments WHERE id = ${id}::uuid FOR UPDATE`;
    const p = await tx.supplierPayment.findUnique({ where: { id } });
    if (!p) throw notFound("supplier_payment");
    if (p.status !== "POSTED") throw new AppError("INVALID_TRANSITION", "errors.invalidTransition");
    if (p.supplierInvoiceId) {
      await tx.$queryRaw`SELECT id FROM supplier_invoices WHERE id = ${p.supplierInvoiceId}::uuid FOR UPDATE`;
      const inv = await tx.supplierInvoice.findUniqueOrThrow({ where: { id: p.supplierInvoiceId } });
      const paid = D(inv.paidAmount).minus(D(p.amount));
      await tx.supplierInvoice.update({ where: { id: inv.id }, data: { paidAmount: paid.isNegative() ? ZERO : paid, status: invStatus(D(inv.total), paid) } });
    }
    await reverseLedger(tx, ctx, id, `Reversal: ${reason}`);
    await reverseCash(tx, ctx, id, `Reversal: ${reason}`);
    await tx.supplierPayment.update({ where: { id }, data: { status: "REVERSED", reversedAt: new Date(), reversedById: ctx.actor.userId, reverseReason: reason } });
    await audit(tx, ctx, { action: "supplier_payment.reverse", entityType: "supplier_payment", entityId: id, entityNumber: p.number, newValues: { reason } });
  });
}

export async function listSupplierPayments(ctx: ServiceContext, input: unknown) {
  requirePermission(ctx, "supplier_payments.view");
  const q = parse(listQuerySchema.extend({ supplierId: uuid.optional(), status: z.enum(["POSTED", "REVERSED"]).optional() }), input);
  const where = {
    ...(q.supplierId ? { supplierId: q.supplierId } : {}),
    ...(q.status ? { status: q.status } : {}),
    ...(q.q ? { OR: [{ number: { contains: q.q, mode: "insensitive" as const } }, { supplier: { name: { contains: q.q, mode: "insensitive" as const } } }] } : {}),
  };
  const [items, total] = await Promise.all([
    ctx.db.supplierPayment.findMany({ where, include: { supplier: { select: { id: true, name: true } }, invoice: { select: { id: true, number: true } }, cashAccount: { select: { name: true } } }, orderBy: { createdAt: "desc" }, ...pageArgs(q) }),
    ctx.db.supplierPayment.count({ where }),
  ]);
  return toPage(items, total, q);
}

export async function getSupplierPayment(ctx: ServiceContext, id: string) {
  requirePermission(ctx, "supplier_payments.view");
  const p = await ctx.db.supplierPayment.findUnique({ where: { id }, include: { supplier: true, invoice: { select: { id: true, number: true, total: true } }, cashAccount: { select: { id: true, name: true } } } });
  if (!p) throw notFound("supplier_payment");
  return p;
}

export async function supplierStatement(ctx: ServiceContext, supplierId: string) {
  requirePermission(ctx, "supplier_payments.view");
  const rows = await ctx.db.partyLedgerEntry.findMany({ where: { supplierId }, orderBy: [{ entryDate: "asc" }, { createdAt: "asc" }] });
  let running = ZERO;
  return rows.map((r) => {
    running = running.plus(D(r.credit)).minus(D(r.debit));
    return { ...r, balance: running };
  });
}
