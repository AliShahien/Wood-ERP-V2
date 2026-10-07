import { z } from "zod";
import { requirePermission, type ServiceContext } from "../context";
import { AppError, conflict, notFound } from "../errors";
import { audit, diff } from "../platform/audit";
import { listQuerySchema, orderBy, pageArgs, toPage } from "../platform/pagination";
import { searchWhere } from "../platform/query";
import { optionalText, parse, recordStatus, requiredText, uuid } from "../validation";

export const warehouseSchema = z.object({
  code: z.string().trim().toUpperCase().min(1).max(20).regex(/^[A-Z0-9_-]+$/),
  name: requiredText(150),
  type: z.enum(["RAW_MATERIALS", "ACCESSORIES", "PAINT", "FINISHED_PRODUCTS", "GENERAL"]).default("GENERAL"),
  location: optionalText(300),
  managerId: uuid.nullable().optional(),
  status: recordStatus.default("ACTIVE"),
});

const include = {
  manager: { select: { id: true, fullName: true } },
  locations: { where: { status: "ACTIVE" as const }, orderBy: { code: "asc" as const } },
  _count: { select: { balances: true } },
} as const;

export async function listWarehouses(ctx: ServiceContext, input: unknown) {
  requirePermission(ctx, "warehouses.view");
  const q = parse(listQuerySchema.extend({ status: recordStatus.optional() }), input);
  const where = { deletedAt: null, ...(q.status ? { status: q.status } : {}), ...searchWhere(q.q, ["name", "code", "location"]) };
  const [items, total] = await Promise.all([
    ctx.db.warehouse.findMany({ where, include, orderBy: orderBy(q, ["code", "name"], "code"), ...pageArgs(q) }),
    ctx.db.warehouse.count({ where }),
  ]);
  return toPage(items, total, q);
}

export async function getWarehouse(ctx: ServiceContext, id: string) {
  requirePermission(ctx, "warehouses.view");
  const w = await ctx.db.warehouse.findFirst({ where: { id, deletedAt: null }, include });
  if (!w) throw notFound("warehouse");
  return w;
}

export async function createWarehouse(ctx: ServiceContext, input: unknown) {
  requirePermission(ctx, "warehouses.create");
  const data = parse(warehouseSchema, input);
  if (await ctx.db.warehouse.findUnique({ where: { code: data.code } })) throw conflict("errors.duplicate", { field: "code" });
  return ctx.db.$transaction(async (tx) => {
    const w = await tx.warehouse.create({ data: { ...data, managerId: data.managerId ?? null, createdById: ctx.actor.userId } });
    await audit(tx, ctx, { action: "warehouse.create", entityType: "warehouse", entityId: w.id, entityNumber: w.code, newValues: data });
    return w;
  });
}

export async function updateWarehouse(ctx: ServiceContext, id: string, input: unknown) {
  requirePermission(ctx, "warehouses.edit");
  const data = parse(warehouseSchema.omit({ code: true }).partial(), input);
  const before = await ctx.db.warehouse.findFirst({ where: { id, deletedAt: null } });
  if (!before) throw notFound("warehouse");
  return ctx.db.$transaction(async (tx) => {
    const w = await tx.warehouse.update({ where: { id }, data: { ...data, updatedById: ctx.actor.userId } });
    const changes = diff(before as Record<string, unknown>, data);
    if (changes) await audit(tx, ctx, { action: "warehouse.update", entityType: "warehouse", entityId: id, entityNumber: before.code, ...changes });
    return w;
  });
}

export async function deleteWarehouse(ctx: ServiceContext, id: string) {
  requirePermission(ctx, "warehouses.delete");
  const w = await ctx.db.warehouse.findFirst({ where: { id, deletedAt: null } });
  if (!w) throw notFound("warehouse");
  if (await ctx.db.inventoryTransaction.count({ where: { warehouseId: id } })) throw new AppError("CONFLICT", "errors.inUse");
  await ctx.db.$transaction(async (tx) => {
    await tx.warehouse.update({ where: { id }, data: { deletedAt: new Date(), status: "INACTIVE" } });
    await audit(tx, ctx, { action: "warehouse.delete", entityType: "warehouse", entityId: id, entityNumber: w.code });
  });
}

export async function addLocation(ctx: ServiceContext, warehouseId: string, input: unknown) {
  requirePermission(ctx, "warehouses.edit");
  const data = parse(z.object({ code: z.string().trim().toUpperCase().min(1).max(20), name: requiredText(100) }), input);
  await getWarehouse(ctx, warehouseId);
  return ctx.db.warehouseLocation.create({ data: { ...data, warehouseId } });
}
