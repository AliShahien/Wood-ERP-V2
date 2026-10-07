import { z } from "zod";
import type { Tx } from "@edge/db";
import { assertInShowroomScope, can, requirePermission, showroomScopeWhere, type ServiceContext } from "../context";
import { AppError, notFound } from "../errors";
import { audit } from "../platform/audit";
import { nextNumber } from "../platform/numbering";
import { listQuerySchema, pageArgs, toPage } from "../platform/pagination";
import { assertTransition, SALES_ORDER_TRANSITIONS } from "../platform/state-machine";
import { optionalText, parse, uuid } from "../validation";
import { notify } from "./notifications";

const scope = (ctx: ServiceContext) => showroomScopeWhere(ctx.actor, { ownerFields: ["createdById", "salespersonId"] });

export const soListSchema = listQuerySchema.extend({
  status: z.enum(["CONFIRMED", "IN_PRODUCTION", "READY", "PARTIALLY_DELIVERED", "DELIVERED", "CLOSED", "CANCELLED"]).optional(),
  customerId: uuid.optional(),
});

export async function listSalesOrders(ctx: ServiceContext, input: unknown) {
  requirePermission(ctx, "sales_orders.view");
  const q = parse(soListSchema, input);
  const where = {
    ...scope(ctx),
    ...(q.status ? { status: q.status } : {}),
    ...(q.customerId ? { customerId: q.customerId } : {}),
    ...(q.q ? { OR: [{ number: { contains: q.q, mode: "insensitive" as const } }, { customer: { name: { contains: q.q, mode: "insensitive" as const } } }, { quotation: { number: { contains: q.q, mode: "insensitive" as const } } }] } : {}),
  };
  const [items, total] = await Promise.all([
    ctx.db.salesOrder.findMany({
      where,
      select: {
        id: true, number: true, status: true, orderDate: true, requiredDate: true, total: true, currency: true,
        customer: { select: { id: true, name: true, code: true } }, quotation: { select: { id: true, number: true } }, showroom: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      ...pageArgs(q),
    }),
    ctx.db.salesOrder.count({ where }),
  ]);
  return toPage(items, total, q);
}

export async function getSalesOrder(ctx: ServiceContext, id: string) {
  requirePermission(ctx, "sales_orders.view");
  const so = await ctx.db.salesOrder.findUnique({
    where: { id },
    include: {
      customer: true,
      showroom: { select: { id: true, code: true, name: true } },
      salesperson: { select: { id: true, fullName: true } },
      quotation: { select: { id: true, number: true, subtotal: true, discountTotal: true, installationCharge: true, transportationCharge: true, taxEnabled: true, taxRate: true, taxTotal: true, total: true, depositRequired: true, paymentTerms: true } },
      items: {
        orderBy: { lineNo: "asc" },
        include: {
          product: { select: { id: true, code: true, name: true } },
          quotationItem: { include: { options: true, measurement: { select: { id: true, number: true } } } },
          mos: { select: { id: true, number: true, status: true } },
        },
      },
      mos: { select: { id: true, number: true, status: true, quantity: true } },
      deliveries: { select: { id: true, number: true, status: true, scheduledDate: true } },
      invoices: { select: { id: true, number: true, status: true, total: true, paidAmount: true } },
      payments: { select: { id: true, number: true, amount: true, status: true, paymentDate: true } },
    },
  });
  if (!so) throw notFound("sales_order");
  assertInShowroomScope(ctx.actor, so);
  const showMoney = can(ctx.actor, "payments.view") || can(ctx.actor, "invoices.view") || can(ctx.actor, "quotations.view");
  return showMoney ? so : { ...so, payments: [], invoices: [] };
}

/** Converts an APPROVED quotation into a sales order (1:1). Concurrency-safe via row lock + unique quotation_id. */
export async function convertQuotation(ctx: ServiceContext, quotationId: string, input: unknown) {
  requirePermission(ctx, "sales_orders.create");
  const data = parse(z.object({ requiredDate: z.coerce.date().nullable().optional(), deliveryAddress: optionalText(500), notes: optionalText(2000) }), input);
  return ctx.db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM quotations WHERE id = ${quotationId}::uuid FOR UPDATE`;
    const qt = await tx.quotation.findUnique({ where: { id: quotationId }, include: { items: { orderBy: { lineNo: "asc" } }, customer: true } });
    if (!qt) throw notFound("quotation");
    assertInShowroomScope(ctx.actor, qt);
    if (qt.status !== "APPROVED") throw new AppError("INVALID_TRANSITION", "errors.quotationNotApproved");
    if (qt.validUntil < new Date()) throw new AppError("CONFLICT", "errors.quotationExpired");
    const now = new Date();
    const number = await nextNumber(tx, "SALES_ORDER", now);
    const so = await tx.salesOrder.create({
      data: {
        number, quotationId: qt.id, customerId: qt.customerId, showroomId: qt.showroomId, salespersonId: qt.salespersonId,
        orderDate: now, requiredDate: data.requiredDate ?? null, currency: qt.currency, total: qt.total,
        deliveryAddress: data.deliveryAddress ?? qt.customer.address, notes: data.notes ?? null, createdById: ctx.actor.userId,
        items: { create: qt.items.map((i) => ({ quotationItemId: i.id, lineNo: i.lineNo, productId: i.productId, quantity: i.quantity })) },
      },
    });
    await tx.quotation.update({ where: { id: qt.id }, data: { status: "CONVERTED", updatedById: ctx.actor.userId } });
    // Link measurements of this quotation to the order.
    await tx.measurement.updateMany({ where: { quotationId: qt.id }, data: { salesOrderId: so.id } });
    await notify(tx, { type: "new_sales_order", permission: "manufacturing.create", params: { number, customer: qt.customer.name }, entityType: "sales_order", entityId: so.id, dedupeKey: `new_so:${so.id}` });
    await audit(tx, ctx, { action: "sales_order.create", entityType: "sales_order", entityId: so.id, entityNumber: number, newValues: { quotation: qt.number, total: qt.total } });
    await audit(tx, ctx, { action: "quotation.converted", entityType: "quotation", entityId: qt.id, entityNumber: qt.number, oldValues: { status: "APPROVED" }, newValues: { status: "CONVERTED", salesOrder: number } });
    return so;
  });
}

export async function cancelSalesOrder(ctx: ServiceContext, id: string, input: unknown) {
  requirePermission(ctx, "sales_orders.cancel");
  const { reason } = parse(z.object({ reason: z.string().trim().min(1).max(1000) }), input);
  return ctx.db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM sales_orders WHERE id = ${id}::uuid FOR UPDATE`;
    const so = await tx.salesOrder.findUnique({ where: { id } });
    if (!so) throw notFound("sales_order");
    assertInShowroomScope(ctx.actor, so);
    assertTransition("sales_order", SALES_ORDER_TRANSITIONS, so.status, "CANCELLED");
    const activeMo = await tx.manufacturingOrder.count({ where: { salesOrderId: id, status: { notIn: ["DRAFT", "CANCELLED"] } } });
    if (activeMo) throw new AppError("CONFLICT", "errors.soHasManufacturing");
    const posted = await tx.customerInvoice.count({ where: { salesOrderId: id, status: { notIn: ["DRAFT", "CANCELLED"] } } });
    if (posted) throw new AppError("CONFLICT", "errors.soHasInvoices");
    await tx.manufacturingOrder.updateMany({ where: { salesOrderId: id, status: "DRAFT" }, data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: reason } });
    const updated = await tx.salesOrder.update({ where: { id }, data: { status: "CANCELLED", cancelledAt: new Date(), cancelledById: ctx.actor.userId, cancelReason: reason } });
    await audit(tx, ctx, { action: "sales_order.cancel", entityType: "sales_order", entityId: id, entityNumber: so.number, oldValues: { status: so.status }, newValues: { status: "CANCELLED", reason } });
    return updated;
  });
}

/**
 * Recomputes the sales order status from its lines (called after MO completion and deliveries).
 * Never moves backwards and never touches cancelled/closed orders.
 */
export async function refreshSalesOrderStatus(tx: Tx, salesOrderId: string) {
  const so = await tx.salesOrder.findUnique({ where: { id: salesOrderId }, include: { items: true, mos: { select: { status: true } } } });
  if (!so || so.status === "CANCELLED" || so.status === "CLOSED") return;
  const qty = so.items.reduce((s, i) => s + Number(i.quantity), 0);
  const delivered = so.items.reduce((s, i) => s + Number(i.deliveredQuantity), 0);
  const produced = so.items.every((i) => Number(i.manufacturedQuantity) >= Number(i.quantity));
  let next = so.status;
  if (delivered >= qty && qty > 0) next = "DELIVERED";
  else if (delivered > 0) next = "PARTIALLY_DELIVERED";
  else if (produced) next = "READY";
  else if (so.mos.some((m) => m.status !== "DRAFT" && m.status !== "CANCELLED")) next = "IN_PRODUCTION";
  const order = ["CONFIRMED", "IN_PRODUCTION", "READY", "PARTIALLY_DELIVERED", "DELIVERED"];
  if (next !== so.status && order.indexOf(next) > order.indexOf(so.status)) {
    await tx.salesOrder.update({ where: { id: salesOrderId }, data: { status: next } });
  }
}
