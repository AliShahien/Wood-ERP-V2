import { z } from "zod";
import { can, requirePermission, type ServiceContext } from "../context";
import { AppError, conflict, notFound } from "../errors";
import { audit, diff } from "../platform/audit";
import { nextNumber } from "../platform/numbering";
import { listQuerySchema, orderBy, pageArgs, toPage } from "../platform/pagination";
import { searchWhere } from "../platform/query";
import { optionalText, parse, recordStatus, requiredText, uuid } from "../validation";

const code = z.string().trim().toUpperCase().min(1).max(30).regex(/^[A-Z0-9_-]+$/);
const qty = z.coerce.number().min(0).max(1e12);

// ───────────── Units ─────────────

export const unitSchema = z.object({ code, name: requiredText(50), symbol: optionalText(20), allowDecimal: z.boolean().default(true), status: recordStatus.default("ACTIVE") });

export async function listUnits(ctx: ServiceContext) {
  requirePermission(ctx, "materials.view");
  return ctx.db.unit.findMany({ orderBy: { code: "asc" } });
}

export async function createUnit(ctx: ServiceContext, input: unknown) {
  requirePermission(ctx, "materials.create");
  const data = parse(unitSchema, input);
  if (await ctx.db.unit.findUnique({ where: { code: data.code } })) throw conflict("errors.duplicate", { field: "code" });
  return ctx.db.$transaction(async (tx) => {
    const u = await tx.unit.create({ data });
    await audit(tx, ctx, { action: "unit.create", entityType: "unit", entityId: u.id, entityNumber: u.code, newValues: data });
    return u;
  });
}

export async function updateUnit(ctx: ServiceContext, id: string, input: unknown) {
  requirePermission(ctx, "materials.edit");
  const data = parse(unitSchema.omit({ code: true }).partial(), input);
  const before = await ctx.db.unit.findUnique({ where: { id } });
  if (!before) throw notFound("unit");
  return ctx.db.$transaction(async (tx) => {
    const u = await tx.unit.update({ where: { id }, data });
    const changes = diff(before as Record<string, unknown>, data);
    if (changes) await audit(tx, ctx, { action: "unit.update", entityType: "unit", entityId: id, entityNumber: before.code, ...changes });
    return u;
  });
}

// ───────────── Material categories ─────────────

export const materialCategorySchema = z.object({
  code,
  name: requiredText(150),
  costCategory: z.enum(["RAW_MATERIAL", "ACCESSORY", "PAINT", "OTHER"]),
  parentId: uuid.nullable().optional(),
  status: recordStatus.default("ACTIVE"),
});

export async function listMaterialCategories(ctx: ServiceContext) {
  requirePermission(ctx, "materials.view");
  return ctx.db.materialCategory.findMany({ where: { deletedAt: null }, include: { _count: { select: { materials: true } } }, orderBy: { code: "asc" } });
}

export async function createMaterialCategory(ctx: ServiceContext, input: unknown) {
  requirePermission(ctx, "materials.create");
  const data = parse(materialCategorySchema, input);
  if (await ctx.db.materialCategory.findUnique({ where: { code: data.code } })) throw conflict("errors.duplicate", { field: "code" });
  return ctx.db.$transaction(async (tx) => {
    const c = await tx.materialCategory.create({ data: { ...data, parentId: data.parentId ?? null } });
    await audit(tx, ctx, { action: "material_category.create", entityType: "material_category", entityId: c.id, entityNumber: c.code, newValues: data });
    return c;
  });
}

export async function updateMaterialCategory(ctx: ServiceContext, id: string, input: unknown) {
  requirePermission(ctx, "materials.edit");
  const data = parse(materialCategorySchema.omit({ code: true }).partial(), input);
  const before = await ctx.db.materialCategory.findFirst({ where: { id, deletedAt: null } });
  if (!before) throw notFound("material_category");
  if (data.parentId === id) throw new AppError("VALIDATION", "errors.validation", [{ path: "parentId", code: "self" }]);
  return ctx.db.$transaction(async (tx) => {
    const c = await tx.materialCategory.update({ where: { id }, data });
    const changes = diff(before as Record<string, unknown>, data);
    if (changes) await audit(tx, ctx, { action: "material_category.update", entityType: "material_category", entityId: id, entityNumber: before.code, ...changes });
    return c;
  });
}

// ───────────── Materials ─────────────

/** Material names are Arabic by business rule; stored exactly as entered. */
export const materialSchema = z.object({
  code: code.optional().nullable(),
  name: requiredText(200),
  categoryId: uuid,
  unitId: uuid,
  minStock: qty.default(0),
  reorderLevel: qty.default(0),
  defaultSupplierId: uuid.nullable().optional(),
  barcode: optionalText(64),
  status: recordStatus.default("ACTIVE"),
  notes: optionalText(2000),
});

export const materialListSchema = listQuerySchema.extend({
  categoryId: uuid.optional(),
  status: recordStatus.optional(),
  lowStock: z.enum(["1"]).optional(),
});

/** Removes cost fields for users without costing.view. */
export function maskCost<T extends Record<string, unknown>>(ctx: ServiceContext, row: T): T {
  if (can(ctx.actor, "costing.view")) return row;
  const { averageCost: _a, lastPurchaseCost: _l, ...rest } = row as Record<string, unknown>;
  return rest as T;
}

export async function listMaterials(ctx: ServiceContext, input: unknown) {
  requirePermission(ctx, "materials.view");
  const q = parse(materialListSchema, input);
  let idFilter: { id?: { in: string[] } } = {};
  if (q.lowStock) {
    // Total on-hand across warehouses at or below reorder level.
    const rows = await ctx.db.$queryRaw<{ id: string }[]>`
      SELECT m.id FROM materials m
      LEFT JOIN inventory_balances b ON b.material_id = m.id
      WHERE m.deleted_at IS NULL AND m.status = 'ACTIVE'
      GROUP BY m.id, m.reorder_level
      HAVING COALESCE(SUM(b.quantity), 0) <= m.reorder_level`;
    idFilter = { id: { in: rows.map((r) => r.id) } };
  }
  const where = {
    deletedAt: null,
    ...idFilter,
    ...(q.categoryId ? { categoryId: q.categoryId } : {}),
    ...(q.status ? { status: q.status } : {}),
    ...searchWhere(q.q, ["name", "code", "barcode"]),
  };
  const [items, total] = await Promise.all([
    ctx.db.material.findMany({
      where,
      include: {
        category: { select: { id: true, code: true, name: true, costCategory: true } },
        unit: { select: { id: true, code: true, name: true } },
        balances: { select: { quantity: true } },
      },
      orderBy: orderBy(q, ["code", "name", "createdAt"], "code"),
      ...pageArgs(q),
    }),
    ctx.db.material.count({ where }),
  ]);
  const shaped = items.map(({ balances, ...m }) =>
    maskCost(ctx, { ...m, onHand: balances.reduce((s, b) => s + Number(b.quantity), 0) }),
  );
  return toPage(shaped, total, q);
}

export async function getMaterial(ctx: ServiceContext, id: string) {
  requirePermission(ctx, "materials.view");
  const m = await ctx.db.material.findFirst({
    where: { id, deletedAt: null },
    include: {
      category: true,
      unit: true,
      defaultSupplier: { select: { id: true, code: true, name: true } },
      balances: { include: { warehouse: { select: { id: true, code: true, name: true } } } },
    },
  });
  if (!m) throw notFound("material");
  return maskCost(ctx, { ...m, onHand: m.balances.reduce((s, b) => s + Number(b.quantity), 0) });
}

export async function createMaterial(ctx: ServiceContext, input: unknown) {
  requirePermission(ctx, "materials.create");
  const data = parse(materialSchema, input);
  if (data.code && (await ctx.db.material.findUnique({ where: { code: data.code } }))) throw conflict("errors.duplicate", { field: "code" });
  return ctx.db.$transaction(async (tx) => {
    const finalCode = data.code || (await nextNumber(tx, "MATERIAL"));
    const m = await tx.material.create({
      data: { ...data, code: finalCode, defaultSupplierId: data.defaultSupplierId ?? null, createdById: ctx.actor.userId },
    });
    await audit(tx, ctx, { action: "material.create", entityType: "material", entityId: m.id, entityNumber: finalCode, newValues: data });
    return m;
  });
}

export async function updateMaterial(ctx: ServiceContext, id: string, input: unknown) {
  requirePermission(ctx, "materials.edit");
  const data = parse(materialSchema.omit({ code: true }).partial(), input);
  const before = await ctx.db.material.findFirst({ where: { id, deletedAt: null } });
  if (!before) throw notFound("material");
  if (data.unitId && data.unitId !== before.unitId) {
    // Changing the unit after movements would corrupt quantities.
    const moved = await ctx.db.inventoryTransaction.count({ where: { materialId: id } });
    if (moved) throw new AppError("CONFLICT", "errors.unitLocked");
  }
  return ctx.db.$transaction(async (tx) => {
    const m = await tx.material.update({ where: { id }, data: { ...data, updatedById: ctx.actor.userId } });
    const changes = diff(before as Record<string, unknown>, data);
    if (changes) await audit(tx, ctx, { action: "material.update", entityType: "material", entityId: id, entityNumber: before.code, ...changes });
    return m;
  });
}

export async function deleteMaterial(ctx: ServiceContext, id: string) {
  requirePermission(ctx, "materials.delete");
  const m = await ctx.db.material.findFirst({ where: { id, deletedAt: null } });
  if (!m) throw notFound("material");
  const [tx, bom] = await Promise.all([
    ctx.db.inventoryTransaction.count({ where: { materialId: id } }),
    ctx.db.bomItem.count({ where: { materialId: id, bom: { status: { not: "ARCHIVED" } } } }),
  ]);
  if (tx || bom) throw new AppError("CONFLICT", "errors.inUse");
  await ctx.db.$transaction(async (t) => {
    await t.material.update({ where: { id }, data: { deletedAt: new Date(), deletedById: ctx.actor.userId, status: "INACTIVE" } });
    await audit(t, ctx, { action: "material.delete", entityType: "material", entityId: id, entityNumber: m.code });
  });
}
