import { z } from "zod";
import { randomUUID } from "node:crypto";
import { assertInShowroomScope, requirePermission, showroomScopeWhere, type ServiceContext } from "../context";
import { AppError, notFound } from "../errors";
import { audit } from "../platform/audit";
import { D, ZERO } from "../platform/money";
import { nextNumber } from "../platform/numbering";
import { listQuerySchema, pageArgs, toPage } from "../platform/pagination";
import { assertTransition, DELIVERY_TRANSITIONS } from "../platform/state-machine";
import { bucketName, getStorage, IMAGE_MIMES, validateUpload } from "../platform/storage";
import { optionalText, parse, uuid } from "../validation";
import { refreshSalesOrderStatus } from "./sales-orders";

export const deliveryListSchema = listQuerySchema.extend({
  status: z.enum(["PENDING", "SCHEDULED", "DELIVERED", "PARTIALLY_DELIVERED", "CANCELLED"]).optional(),
  salesOrderId: uuid.optional(),
  date: z.coerce.date().optional(),
});

export async function listDeliveries(ctx: ServiceContext, input: unknown) {
  requirePermission(ctx, "deliveries.view");
  const q = parse(deliveryListSchema, input);
  const dayRange = q.date ? { scheduledDate: { gte: new Date(new Date(q.date).setHours(0, 0, 0, 0)), lte: new Date(new Date(q.date).setHours(23, 59, 59, 999)) } } : {};
  const scoped = showroomScopeWhere(ctx.actor, { ownerFields: ["createdById", "salespersonId"] });
  const where = {
    ...(Object.keys(scoped).length ? { salesOrder: scoped } : {}),
    ...(q.status ? { status: q.status } : {}),
    ...(q.salesOrderId ? { salesOrderId: q.salesOrderId } : {}),
    ...dayRange,
    ...(q.q ? { OR: [{ number: { contains: q.q, mode: "insensitive" as const } }, { customer: { name: { contains: q.q, mode: "insensitive" as const } } }, { salesOrder: { number: { contains: q.q, mode: "insensitive" as const } } }] } : {}),
  };
  const [items, total] = await Promise.all([
    ctx.db.delivery.findMany({ where, include: { customer: { select: { id: true, name: true, phone: true } }, salesOrder: { select: { id: true, number: true } }, _count: { select: { items: true } } }, orderBy: [{ scheduledDate: "asc" }, { createdAt: "desc" }], ...pageArgs(q) }),
    ctx.db.delivery.count({ where }),
  ]);
  return toPage(items, total, q);
}

export async function getDelivery(ctx: ServiceContext, id: string) {
  requirePermission(ctx, "deliveries.view");
  const d = await ctx.db.delivery.findUnique({
    where: { id },
    include: {
      customer: true,
      salesOrder: { select: { id: true, number: true, showroomId: true, createdById: true, salespersonId: true } },
      items: { include: { salesOrderItem: { include: { product: { select: { code: true, name: true } }, quotationItem: { select: { width: true, height: true, thickness: true, options: { select: { name: true } } } } } } } },
    },
  });
  if (!d) throw notFound("delivery");
  assertInShowroomScope(ctx.actor, d.salesOrder);
  const signature =await ctx.db.attachment.findFirst({ where: { entityType: "delivery", entityId: id, category: "SIGNATURE", deletedAt: null }, orderBy: { createdAt: "desc" }, select: { id: true } });
  return { ...d, signatureId: signature?.id ?? null };
}

/** Quantity of each SO line that is manufactured but not yet delivered or on an open delivery. */
async function deliverable(ctx: ServiceContext, salesOrderId: string) {
  const items = await ctx.db.salesOrderItem.findMany({ where: { salesOrderId }, include: { deliveryItems: { where: { delivery: { status: { in: ["PENDING", "SCHEDULED"] } } } } } });
  return items.map((i) => {
    const onOpen = i.deliveryItems.reduce((s, d) => s.plus(D(d.quantity)), ZERO);
    return { item: i, available: D(i.manufacturedQuantity).minus(D(i.deliveredQuantity)).minus(onOpen) };
  });
}

export const deliveryCreateSchema = z.object({
  address: optionalText(500),
  scheduledDate: z.coerce.date().nullable().optional(),
  driverName: optionalText(150),
  vehicle: optionalText(100),
  installationRequired: z.boolean().default(false),
  notes: optionalText(1000),
  lines: z.array(z.object({ salesOrderItemId: uuid, quantity: z.coerce.number().positive() })).optional(),
});

export async function createDelivery(ctx: ServiceContext, salesOrderId: string, input: unknown) {
  requirePermission(ctx, "deliveries.create");
  const data = parse(deliveryCreateSchema, input);
  return ctx.db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM sales_orders WHERE id = ${salesOrderId}::uuid FOR UPDATE`;
    const so = await tx.salesOrder.findUnique({ where: { id: salesOrderId }, include: { customer: true } });
    if (!so) throw notFound("sales_order");
    assertInShowroomScope(ctx.actor, so);
    if (so.status === "CANCELLED" || so.status === "CLOSED") throw new AppError("INVALID_TRANSITION", "errors.invalidTransition");
    const avail = await deliverable({ ...ctx, db: tx as never }, salesOrderId);
    const requested = data.lines ? new Map(data.lines.map((l) => [l.salesOrderItemId, D(l.quantity)])) : null;
    const lines = avail
      .map((a) => ({ id: a.item.id, qty: requested ? (requested.get(a.item.id) ?? ZERO) : a.available, available: a.available }))
      .filter((l) => l.qty.greaterThan(0));
    for (const l of lines) if (l.qty.greaterThan(l.available)) throw new AppError("VALIDATION", "errors.notManufactured", [{ path: "lines", code: "range" }]);
    if (!lines.length) throw new AppError("VALIDATION", "errors.nothingToDeliver");
    const number = await nextNumber(tx, "DELIVERY");
    const d = await tx.delivery.create({
      data: {
        number, salesOrderId, customerId: so.customerId, address: data.address ?? so.deliveryAddress ?? so.customer.address ?? "—",
        scheduledDate: data.scheduledDate ?? null, driverName: data.driverName, vehicle: data.vehicle, notes: data.notes,
        status: data.scheduledDate ? "SCHEDULED" : "PENDING", installationStatus: data.installationRequired ? "PENDING" : "NOT_REQUIRED", createdById: ctx.actor.userId,
        items: { create: lines.map((l) => ({ salesOrderItemId: l.id, quantity: l.qty })) },
      },
    });
    await audit(tx, ctx, { action: "delivery.create", entityType: "delivery", entityId: d.id, entityNumber: number, newValues: { salesOrder: so.number, lines: lines.length } });
    return d;
  });
}

export const scheduleSchema = z.object({ scheduledDate: z.coerce.date(), driverName: optionalText(150), vehicle: optionalText(100), address: optionalText(500) });

export async function scheduleDelivery(ctx: ServiceContext, id: string, input: unknown) {
  requirePermission(ctx, "deliveries.update");
  const data = parse(scheduleSchema, input);
  return ctx.db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM deliveries WHERE id = ${id}::uuid FOR UPDATE`;
    const d = await tx.delivery.findUnique({ where: { id } });
    if (!d) throw notFound("delivery");
    if (d.status !== "PENDING" && d.status !== "SCHEDULED") throw new AppError("INVALID_TRANSITION", "errors.invalidTransition");
    const u = await tx.delivery.update({ where: { id }, data: { ...data, address: data.address ?? d.address, status: "SCHEDULED", updatedById: ctx.actor.userId } });
    await audit(tx, ctx, { action: "delivery.schedule", entityType: "delivery", entityId: id, entityNumber: d.number, newValues: data });
    return u;
  });
}

export const completeSchema = z.object({
  receivedByName: z.string().trim().min(1).max(150),
  lines: z.array(z.object({ deliveryItemId: uuid, deliveredQuantity: z.coerce.number().min(0) })).optional(),
  installationStatus: z.enum(["NOT_REQUIRED", "PENDING", "IN_PROGRESS", "COMPLETED"]).optional(),
  notes: optionalText(1000),
});

/**
 * Confirms delivery. Delivered quantities update the sales order lines; a delivery with any
 * shortfall becomes PARTIALLY_DELIVERED (the remainder can go on a new delivery).
 */
export async function completeDelivery(ctx: ServiceContext, id: string, input: unknown) {
  requirePermission(ctx, "deliveries.update");
  const data = parse(completeSchema, input);
  return ctx.db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM deliveries WHERE id = ${id}::uuid FOR UPDATE`;
    const d = await tx.delivery.findUnique({ where: { id }, include: { items: true } });
    if (!d) throw notFound("delivery");
    const given = new Map((data.lines ?? []).map((l) => [l.deliveryItemId, D(l.deliveredQuantity)]));
    let partial = false;
    for (const it of d.items) {
      const qty = given.has(it.id) ? given.get(it.id)! : D(it.quantity);
      if (qty.greaterThan(D(it.quantity))) throw new AppError("VALIDATION", "errors.validation", [{ path: "lines", code: "range" }]);
      if (qty.lessThan(D(it.quantity))) partial = true;
      await tx.deliveryItem.update({ where: { id: it.id }, data: { deliveredQuantity: qty } });
      const soi = await tx.salesOrderItem.findUniqueOrThrow({ where: { id: it.salesOrderItemId } });
      if (D(soi.deliveredQuantity).plus(qty).greaterThan(D(soi.quantity))) throw new AppError("CONFLICT", "errors.overDelivery");
      await tx.salesOrderItem.update({ where: { id: soi.id }, data: { deliveredQuantity: { increment: qty } } });
    }
    const to = partial ? "PARTIALLY_DELIVERED" : "DELIVERED";
    assertTransition("delivery", DELIVERY_TRANSITIONS, d.status, to);
    const u = await tx.delivery.update({
      where: { id },
      data: {
        status: to, deliveredAt: new Date(), receivedByName: data.receivedByName, updatedById: ctx.actor.userId,
        installationStatus: data.installationStatus ?? (d.installationStatus === "PENDING" ? "PENDING" : d.installationStatus),
        notes: data.notes ?? d.notes,
      },
    });
    await refreshSalesOrderStatus(tx, d.salesOrderId);
    await audit(tx, ctx, { action: "delivery.complete", entityType: "delivery", entityId: id, entityNumber: d.number, newValues: { status: to, receivedBy: data.receivedByName } });
    return u;
  });
}

export async function updateInstallation(ctx: ServiceContext, id: string, input: unknown) {
  requirePermission(ctx, "deliveries.update");
  const { installationStatus } = parse(z.object({ installationStatus: z.enum(["PENDING", "IN_PROGRESS", "COMPLETED"]) }), input);
  const d = await ctx.db.delivery.findUnique({ where: { id } });
  if (!d) throw notFound("delivery");
  if (d.installationStatus === "NOT_REQUIRED" || d.status === "CANCELLED") throw new AppError("INVALID_TRANSITION", "errors.invalidTransition");
  return ctx.db.$transaction(async (tx) => {
    const u = await tx.delivery.update({ where: { id }, data: { installationStatus, updatedById: ctx.actor.userId } });
    await audit(tx, ctx, { action: "delivery.installation", entityType: "delivery", entityId: id, entityNumber: d.number, oldValues: { installationStatus: d.installationStatus }, newValues: { installationStatus } });
    return u;
  });
}

export async function cancelDelivery(ctx: ServiceContext, id: string, input: unknown) {
  requirePermission(ctx, "deliveries.cancel");
  const { reason } = parse(z.object({ reason: z.string().trim().min(1).max(500) }), input);
  return ctx.db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM deliveries WHERE id = ${id}::uuid FOR UPDATE`;
    const d = await tx.delivery.findUnique({ where: { id } });
    if (!d) throw notFound("delivery");
    assertTransition("delivery", DELIVERY_TRANSITIONS, d.status, "CANCELLED");
    await tx.delivery.update({ where: { id }, data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: reason } });
    await audit(tx, ctx, { action: "delivery.cancel", entityType: "delivery", entityId: id, entityNumber: d.number, newValues: { reason } });
  });
}

/** Stores the customer's drawn signature (PNG) as a SIGNATURE attachment of the delivery. */
export async function saveSignature(ctx: ServiceContext, id: string, body: Buffer) {
  requirePermission(ctx, "deliveries.update");
  const d = await ctx.db.delivery.findUnique({ where: { id } });
  if (!d) throw notFound("delivery");
  const { mime, ext } = validateUpload(body, IMAGE_MIMES);
  const bucket = bucketName("delivery");
  const key = `delivery/${id}/signature-${randomUUID()}.${ext}`;
  await getStorage().put(bucket, key, body, mime);
  return ctx.db.$transaction(async (tx) => {
    const a = await tx.attachment.create({
      data: { entityType: "delivery", entityId: id, category: "SIGNATURE", bucket, storageKey: key, fileName: `signature-${d.number}.${ext}`, mimeType: mime, sizeBytes: body.length, createdById: ctx.actor.userId },
    });
    await audit(tx, ctx, { action: "delivery.signature", entityType: "delivery", entityId: id, entityNumber: d.number });
    return a;
  });
}

export async function deliverableLines(ctx: ServiceContext, salesOrderId: string) {
  requirePermission(ctx, "deliveries.view");
  const rows = await deliverable(ctx, salesOrderId);
  return rows.map((r) => ({ salesOrderItemId: r.item.id, lineNo: r.item.lineNo, available: r.available }));
}
