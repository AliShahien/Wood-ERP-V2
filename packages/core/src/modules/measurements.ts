import { z } from "zod";
import { assertInShowroomScope, requirePermission, type ServiceContext } from "../context";
import { AppError, notFound } from "../errors";
import { audit } from "../platform/audit";
import { nextNumber } from "../platform/numbering";
import { listQuerySchema, pageArgs, toPage } from "../platform/pagination";
import { optionalText, parse, uuid } from "../validation";
import { loadScopedCustomer } from "./customers";

const dim = z.coerce.number().positive().max(10000);

export const versionSchema = z.object({
  width: dim,
  height: dim,
  thickness: dim.nullable().optional(),
  wallThickness: dim.nullable().optional(),
  openingType: optionalText(100),
  openingDirection: optionalText(100),
  frameDetails: optionalText(1000),
  installationNotes: optionalText(2000),
  notes: optionalText(2000),
});

export const measurementSchema = versionSchema.extend({
  customerId: uuid,
  productId: uuid.nullable().optional(),
  quotationId: uuid.nullable().optional(),
  salesOrderId: uuid.nullable().optional(),
  location: optionalText(200),
  room: optionalText(100),
  measuredById: uuid.nullable().optional(),
  measurementDate: z.coerce.date().optional(),
});

/** Measurements inherit the customer's showroom scope. */
function scopeWhere(ctx: ServiceContext) {
  const a = ctx.actor;
  if (a.isSuperAdmin || a.dataScope === "ALL") return {};
  if (a.dataScope === "SHOWROOM") return { customer: { showroomId: a.showroomId ?? "00000000-0000-0000-0000-000000000000" } };
  return { OR: [{ createdById: a.userId }, { measuredById: a.userId }] };
}

export async function listMeasurements(ctx: ServiceContext, input: unknown) {
  requirePermission(ctx, "measurements.view");
  const q = parse(listQuerySchema.extend({ customerId: uuid.optional(), quotationId: uuid.optional(), salesOrderId: uuid.optional(), status: z.enum(["DRAFT", "APPROVED", "CANCELLED"]).optional() }), input);
  const where = {
    ...scopeWhere(ctx),
    ...(q.customerId ? { customerId: q.customerId } : {}),
    ...(q.quotationId ? { quotationId: q.quotationId } : {}),
    ...(q.salesOrderId ? { salesOrderId: q.salesOrderId } : {}),
    ...(q.status ? { status: q.status } : {}),
    ...(q.q ? { AND: [{ OR: [{ number: { contains: q.q, mode: "insensitive" as const } }, { customer: { name: { contains: q.q, mode: "insensitive" as const } } }, { room: { contains: q.q, mode: "insensitive" as const } }] }] } : {}),
  };
  const [items, total] = await Promise.all([
    ctx.db.measurement.findMany({
      where,
      include: {
        customer: { select: { id: true, name: true } }, product: { select: { id: true, name: true, code: true } }, measuredBy: { select: { fullName: true } },
        versions: { orderBy: { version: "desc" }, take: 1, select: { version: true, width: true, height: true, thickness: true, approvedAt: true } },
      },
      orderBy: { createdAt: "desc" },
      ...pageArgs(q),
    }),
    ctx.db.measurement.count({ where }),
  ]);
  return toPage(items, total, q);
}

export async function getMeasurement(ctx: ServiceContext, id: string) {
  requirePermission(ctx, "measurements.view");
  const m = await ctx.db.measurement.findUnique({
    where: { id },
    include: {
      customer: true, product: { select: { id: true, code: true, name: true } }, measuredBy: { select: { id: true, fullName: true } },
      quotation: { select: { id: true, number: true } }, salesOrder: { select: { id: true, number: true } },
      versions: { orderBy: { version: "desc" } },
    },
  });
  if (!m) throw notFound("measurement");
  assertInShowroomScope(ctx.actor, { showroomId: m.customer.showroomId, createdById: m.createdById, salespersonId: m.measuredById });
  return m;
}

export async function createMeasurement(ctx: ServiceContext, input: unknown) {
  requirePermission(ctx, "measurements.create");
  const data = parse(measurementSchema, input);
  await loadScopedCustomer(ctx, data.customerId);
  return ctx.db.$transaction(async (tx) => {
    const date = data.measurementDate ?? new Date();
    const number = await nextNumber(tx, "MEASUREMENT", date);
    const { width, height, thickness, wallThickness, openingType, openingDirection, frameDetails, installationNotes, notes, ...header } = data;
    const m = await tx.measurement.create({
      data: {
        number, customerId: header.customerId, productId: header.productId ?? null, quotationId: header.quotationId ?? null, salesOrderId: header.salesOrderId ?? null,
        location: header.location, room: header.room, measuredById: header.measuredById ?? ctx.actor.userId, measurementDate: date, createdById: ctx.actor.userId,
        versions: { create: { version: 1, width, height, thickness: thickness ?? null, wallThickness: wallThickness ?? null, openingType, openingDirection, frameDetails, installationNotes, notes, createdById: ctx.actor.userId } },
      },
    });
    await audit(tx, ctx, { action: "measurement.create", entityType: "measurement", entityId: m.id, entityNumber: number, newValues: { width, height } });
    return m;
  });
}

/**
 * Edits the current DRAFT version in place. If the current version is approved, a NEW version is
 * created (reason required) and the measurement returns to DRAFT — approved data is never altered.
 */
export async function reviseMeasurement(ctx: ServiceContext, id: string, input: unknown) {
  requirePermission(ctx, "measurements.edit");
  const data = parse(versionSchema.extend({ changeReason: optionalText(500) }), input);
  return ctx.db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM measurements WHERE id = ${id}::uuid FOR UPDATE`;
    const m = await getMeasurement({ ...ctx, db: tx as never }, id);
    if (m.status === "CANCELLED") throw new AppError("INVALID_TRANSITION", "errors.invalidTransition");
    const current = m.versions[0]!;
    const { changeReason, ...v } = data;
    if (!current.approvedAt) {
      await tx.measurementVersion.update({ where: { id: current.id }, data: { ...v, thickness: v.thickness ?? null, wallThickness: v.wallThickness ?? null } });
      await audit(tx, ctx, { action: "measurement.update", entityType: "measurement", entityId: id, entityNumber: m.number, oldValues: { width: current.width, height: current.height }, newValues: { width: v.width, height: v.height } });
      return tx.measurement.findUniqueOrThrow({ where: { id } });
    }
    if (!changeReason) throw new AppError("VALIDATION", "errors.changeReasonRequired", [{ path: "changeReason", code: "required" }]);
    const next = current.version + 1;
    await tx.measurementVersion.create({ data: { measurementId: id, version: next, ...v, thickness: v.thickness ?? null, wallThickness: v.wallThickness ?? null, changeReason, createdById: ctx.actor.userId } });
    const updated = await tx.measurement.update({ where: { id }, data: { currentVersion: next, status: "DRAFT", updatedById: ctx.actor.userId } });
    await audit(tx, ctx, { action: "measurement.new_version", entityType: "measurement", entityId: id, entityNumber: m.number, oldValues: { version: current.version, width: current.width, height: current.height }, newValues: { version: next, width: v.width, height: v.height, reason: changeReason } });
    return updated;
  });
}

export async function approveMeasurement(ctx: ServiceContext, id: string) {
  requirePermission(ctx, "measurements.approve");
  return ctx.db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM measurements WHERE id = ${id}::uuid FOR UPDATE`;
    const m = await getMeasurement({ ...ctx, db: tx as never }, id);
    if (m.status !== "DRAFT") throw new AppError("INVALID_TRANSITION", "errors.invalidTransition");
    const current = m.versions[0]!;
    await tx.measurementVersion.update({ where: { id: current.id }, data: { approvedAt: new Date(), approvedById: ctx.actor.userId } });
    const updated = await tx.measurement.update({ where: { id }, data: { status: "APPROVED", updatedById: ctx.actor.userId } });
    await audit(tx, ctx, { action: "measurement.approve", entityType: "measurement", entityId: id, entityNumber: m.number, newValues: { version: current.version } });
    return updated;
  });
}

export async function cancelMeasurement(ctx: ServiceContext, id: string) {
  requirePermission(ctx, "measurements.edit");
  const m = await getMeasurement(ctx, id);
  if (m.status === "CANCELLED") throw new AppError("INVALID_TRANSITION", "errors.invalidTransition");
  const used = await ctx.db.manufacturingOrder.count({ where: { measurementVersion: { measurementId: id }, status: { not: "CANCELLED" } } });
  if (used) throw new AppError("CONFLICT", "errors.inUse");
  return ctx.db.measurement.update({ where: { id }, data: { status: "CANCELLED", updatedById: ctx.actor.userId } });
}
