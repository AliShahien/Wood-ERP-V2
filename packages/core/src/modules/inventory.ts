import { z } from "zod";
import { assertWarehouseAccess, can, requireAnyPermission, requirePermission, type ServiceContext } from "../context";
import { AppError, notFound } from "../errors";
import { audit } from "../platform/audit";
import { postStock, reverseStock } from "../platform/inventory";
import { D, money } from "../platform/money";
import { nextNumber } from "../platform/numbering";
import { listQuerySchema, pageArgs, toPage } from "../platform/pagination";
import { optionalText, parse, uuid } from "../validation";

const warehouseFilter = (ctx: ServiceContext) =>
  ctx.actor.warehouseIds.length && !ctx.actor.isSuperAdmin ? { warehouseId: { in: [...ctx.actor.warehouseIds] } } : {};

// ───────────────────────── Stock queries ─────────────────────────

export async function stockBalances(ctx: ServiceContext, input: unknown) {
  requirePermission(ctx, "inventory.view");
  const q = parse(listQuerySchema.extend({ warehouseId: uuid.optional(), categoryId: uuid.optional(), nonZero: z.enum(["1"]).optional() }), input);
  const where = {
    ...warehouseFilter(ctx),
    ...(q.warehouseId ? { warehouseId: q.warehouseId } : {}),
    ...(q.nonZero ? { quantity: { not: 0 } } : {}),
    material: {
      deletedAt: null,
      ...(q.categoryId ? { categoryId: q.categoryId } : {}),
      ...(q.q ? { OR: [{ name: { contains: q.q, mode: "insensitive" as const } }, { code: { contains: q.q, mode: "insensitive" as const } }] } : {}),
    },
  };
  const [rows, total] = await Promise.all([
    ctx.db.inventoryBalance.findMany({
      where,
      include: { material: { select: { id: true, code: true, name: true, averageCost: true, reorderLevel: true, unit: { select: { name: true } } } }, warehouse: { select: { id: true, code: true, name: true } } },
      orderBy: [{ material: { code: "asc" } }, { warehouse: { code: "asc" } }],
      ...pageArgs(q),
    }),
    ctx.db.inventoryBalance.count({ where }),
  ]);
  const showCost = can(ctx.actor, "costing.view");
  return toPage(rows.map((r) => ({ ...r, value: showCost ? money(D(r.quantity).times(D(r.material.averageCost))) : null, material: { ...r.material, averageCost: showCost ? r.material.averageCost : null } })), total, q);
}

/** Inventory valuation at moving average (costing.view). */
export async function stockValue(ctx: ServiceContext) {
  requirePermission(ctx, "costing.view");
  const rows = await ctx.db.$queryRaw<{ value: string | null }[]>`
    SELECT SUM(b.quantity * m.average_cost)::text AS value FROM inventory_balances b JOIN materials m ON m.id = b.material_id`;
  return Number(rows[0]?.value ?? 0);
}

export const movementsSchema = listQuerySchema.extend({
  materialId: uuid.optional(),
  warehouseId: uuid.optional(),
  type: z.string().max(40).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export async function stockMovements(ctx: ServiceContext, input: unknown) {
  requireAnyPermission(ctx, "inventory.view", "materials.view");
  const q = parse(movementsSchema, input);
  const where = {
    ...warehouseFilter(ctx),
    ...(q.materialId ? { materialId: q.materialId } : {}),
    ...(q.warehouseId ? { warehouseId: q.warehouseId } : {}),
    ...(q.type ? { type: q.type as never } : {}),
    ...(q.from || q.to ? { transactionDate: { ...(q.from ? { gte: q.from } : {}), ...(q.to ? { lte: q.to } : {}) } } : {}),
    ...(q.q ? { OR: [{ referenceNumber: { contains: q.q, mode: "insensitive" as const } }, { material: { name: { contains: q.q, mode: "insensitive" as const } } }] } : {}),
  };
  const [rows, total] = await Promise.all([
    ctx.db.inventoryTransaction.findMany({
      where,
      include: { material: { select: { id: true, code: true, name: true, unit: { select: { name: true } } } }, warehouse: { select: { id: true, name: true } } },
      orderBy: [{ transactionDate: "desc" }, { createdAt: "desc" }],
      ...pageArgs(q),
    }),
    ctx.db.inventoryTransaction.count({ where }),
  ]);
  const showCost = can(ctx.actor, "costing.view");
  return toPage(rows.map((r) => (showCost ? r : { ...r, unitCost: null, totalCost: null })), total, q);
}

// ───────────────────────── Adjustments (incl. opening balance) ─────────────────────────

export const adjustmentSchema = z.object({
  warehouseId: uuid,
  adjustmentDate: z.coerce.date().optional(),
  isOpening: z.boolean().default(false),
  reason: z.string().trim().min(1).max(500),
  notes: optionalText(1000),
  items: z.array(z.object({
    materialId: uuid,
    quantityChange: z.coerce.number().refine((v) => v !== 0),
    unitCost: z.coerce.number().min(0).nullable().optional(),
    notes: optionalText(300),
  })).min(1).max(500),
});

export async function createAdjustment(ctx: ServiceContext, input: unknown) {
  requirePermission(ctx, "inventory.adjust");
  const data = parse(adjustmentSchema, input);
  assertWarehouseAccess(ctx.actor, data.warehouseId);
  if (data.isOpening && data.items.some((i) => i.quantityChange < 0)) throw new AppError("VALIDATION", "errors.openingMustBePositive");
  if (data.items.some((i) => i.quantityChange > 0 && (i.unitCost === null || i.unitCost === undefined))) {
    throw new AppError("VALIDATION", "errors.unitCostRequired", [{ path: "items", code: "unitCost" }]);
  }
  return ctx.db.$transaction(async (tx) => {
    const number = await nextNumber(tx, "STOCK_ADJUSTMENT", data.adjustmentDate ?? new Date());
    const adj = await tx.stockAdjustment.create({
      data: {
        number, warehouseId: data.warehouseId, adjustmentDate: data.adjustmentDate ?? new Date(), isOpening: data.isOpening, reason: data.reason, notes: data.notes,
        createdById: ctx.actor.userId, items: { create: data.items.map((i) => ({ materialId: i.materialId, quantityChange: i.quantityChange, unitCost: i.unitCost ?? null, notes: i.notes ?? null })) },
      },
    });
    await audit(tx, ctx, { action: "stock_adjustment.create", entityType: "stock_adjustment", entityId: adj.id, entityNumber: number, newValues: { lines: data.items.length, opening: data.isOpening } });
    return adj;
  });
}

export async function postAdjustment(ctx: ServiceContext, id: string) {
  requirePermission(ctx, "inventory.adjust");
  return ctx.db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM stock_adjustments WHERE id = ${id}::uuid FOR UPDATE`;
    const adj = await tx.stockAdjustment.findUnique({ where: { id }, include: { items: true } });
    if (!adj) throw notFound("stock_adjustment");
    if (adj.status !== "DRAFT") throw new AppError("INVALID_TRANSITION", "errors.invalidTransition");
    assertWarehouseAccess(ctx.actor, adj.warehouseId);
    await postStock(tx, ctx, { type: "stock_adjustment", id: adj.id, number: adj.number, date: adj.adjustmentDate },
      adj.items.map((i) => ({
        materialId: i.materialId, warehouseId: adj.warehouseId, quantity: i.quantityChange,
        unitCost: D(i.quantityChange).greaterThan(0) ? i.unitCost : undefined,
        type: adj.isOpening ? ("OPENING_BALANCE" as const) : D(i.quantityChange).greaterThan(0) ? ("ADJUSTMENT_IN" as const) : ("ADJUSTMENT_OUT" as const),
        notes: i.notes ?? adj.reason,
      })),
    );
    const posted = await tx.stockAdjustment.update({ where: { id }, data: { status: "POSTED", postedAt: new Date(), postedById: ctx.actor.userId } });
    await audit(tx, ctx, { action: "stock_adjustment.post", entityType: "stock_adjustment", entityId: id, entityNumber: adj.number });
    return posted;
  });
}

export async function reverseAdjustment(ctx: ServiceContext, id: string, input: unknown) {
  requirePermission(ctx, "inventory.adjust");
  const { reason } = parse(z.object({ reason: z.string().trim().min(1).max(500) }), input);
  return ctx.db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM stock_adjustments WHERE id = ${id}::uuid FOR UPDATE`;
    const adj = await tx.stockAdjustment.findUnique({ where: { id } });
    if (!adj) throw notFound("stock_adjustment");
    if (adj.status !== "POSTED") throw new AppError("INVALID_TRANSITION", "errors.invalidTransition");
    await reverseStock(tx, ctx, { type: "stock_adjustment", id, number: adj.number, date: new Date() }, reason);
    await tx.stockAdjustment.update({ where: { id }, data: { status: "REVERSED" } });
    await audit(tx, ctx, { action: "stock_adjustment.reverse", entityType: "stock_adjustment", entityId: id, entityNumber: adj.number, newValues: { reason } });
  });
}

export async function listAdjustments(ctx: ServiceContext, input: unknown) {
  requirePermission(ctx, "inventory.view");
  const q = parse(listQuerySchema, input);
  const where = { ...warehouseFilter(ctx), ...(q.q ? { number: { contains: q.q, mode: "insensitive" as const } } : {}) };
  const [items, total] = await Promise.all([
    ctx.db.stockAdjustment.findMany({ where, include: { warehouse: { select: { name: true } }, _count: { select: { items: true } } }, orderBy: { createdAt: "desc" }, ...pageArgs(q) }),
    ctx.db.stockAdjustment.count({ where }),
  ]);
  return toPage(items, total, q);
}

export async function getAdjustment(ctx: ServiceContext, id: string) {
  requirePermission(ctx, "inventory.view");
  const a = await ctx.db.stockAdjustment.findUnique({ where: { id }, include: { warehouse: true, items: { include: { material: { select: { code: true, name: true, unit: { select: { name: true } } } } } } } });
  if (!a) throw notFound("stock_adjustment");
  return a;
}

// ───────────────────────── Transfers ─────────────────────────

export const transferSchema = z.object({
  fromWarehouseId: uuid,
  toWarehouseId: uuid,
  transferDate: z.coerce.date().optional(),
  notes: optionalText(1000),
  items: z.array(z.object({ materialId: uuid, quantity: z.coerce.number().positive(), notes: optionalText(300) })).min(1).max(500),
}).refine((d) => d.fromWarehouseId !== d.toWarehouseId, { path: ["toWarehouseId"], message: "same warehouse" });

export async function createTransfer(ctx: ServiceContext, input: unknown) {
  requirePermission(ctx, "inventory.transfer");
  const data = parse(transferSchema, input);
  assertWarehouseAccess(ctx.actor, data.fromWarehouseId);
  return ctx.db.$transaction(async (tx) => {
    const number = await nextNumber(tx, "STOCK_TRANSFER", data.transferDate ?? new Date());
    const tr = await tx.stockTransfer.create({
      data: {
        number, fromWarehouseId: data.fromWarehouseId, toWarehouseId: data.toWarehouseId, transferDate: data.transferDate ?? new Date(), notes: data.notes,
        createdById: ctx.actor.userId, items: { create: data.items.map((i) => ({ materialId: i.materialId, quantity: i.quantity, notes: i.notes ?? null })) },
      },
    });
    await audit(tx, ctx, { action: "stock_transfer.create", entityType: "stock_transfer", entityId: tr.id, entityNumber: number });
    return tr;
  });
}

export async function postTransfer(ctx: ServiceContext, id: string) {
  requirePermission(ctx, "inventory.transfer");
  return ctx.db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM stock_transfers WHERE id = ${id}::uuid FOR UPDATE`;
    const tr = await tx.stockTransfer.findUnique({ where: { id }, include: { items: true } });
    if (!tr) throw notFound("stock_transfer");
    if (tr.status !== "DRAFT") throw new AppError("INVALID_TRANSITION", "errors.invalidTransition");
    assertWarehouseAccess(ctx.actor, tr.fromWarehouseId);
    const ref = { type: "stock_transfer", id: tr.id, number: tr.number, date: tr.transferDate };
    // Out and in in the same transaction, both at the moving average (value unchanged).
    await postStock(tx, ctx, ref, tr.items.flatMap((i) => [
      { materialId: i.materialId, warehouseId: tr.fromWarehouseId, quantity: D(i.quantity).negated(), type: "TRANSFER_OUT" as const },
      { materialId: i.materialId, warehouseId: tr.toWarehouseId, quantity: D(i.quantity), type: "TRANSFER_IN" as const },
    ]));
    const posted = await tx.stockTransfer.update({ where: { id }, data: { status: "POSTED", postedAt: new Date(), postedById: ctx.actor.userId } });
    await audit(tx, ctx, { action: "stock_transfer.post", entityType: "stock_transfer", entityId: id, entityNumber: tr.number });
    return posted;
  });
}

export async function listTransfers(ctx: ServiceContext, input: unknown) {
  requirePermission(ctx, "inventory.view");
  const q = parse(listQuerySchema, input);
  const where = q.q ? { number: { contains: q.q, mode: "insensitive" as const } } : {};
  const [items, total] = await Promise.all([
    ctx.db.stockTransfer.findMany({ where, include: { fromWarehouse: { select: { name: true } }, toWarehouse: { select: { name: true } }, _count: { select: { items: true } } }, orderBy: { createdAt: "desc" }, ...pageArgs(q) }),
    ctx.db.stockTransfer.count({ where }),
  ]);
  return toPage(items, total, q);
}

export async function getTransfer(ctx: ServiceContext, id: string) {
  requirePermission(ctx, "inventory.view");
  const tr = await ctx.db.stockTransfer.findUnique({ where: { id }, include: { fromWarehouse: true, toWarehouse: true, items: { include: { material: { select: { code: true, name: true, unit: { select: { name: true } } } } } } } });
  if (!tr) throw notFound("stock_transfer");
  return tr;
}

/** Materials at or below reorder level (total across warehouses). */
export async function lowStock(ctx: Pick<ServiceContext, "db">) {
  return ctx.db.$queryRaw<{ id: string; code: string; name: string; on_hand: string; reorder_level: string }[]>`
    SELECT m.id, m.code, m.name, COALESCE(SUM(b.quantity), 0)::text AS on_hand, m.reorder_level::text
    FROM materials m LEFT JOIN inventory_balances b ON b.material_id = m.id
    WHERE m.deleted_at IS NULL AND m.status = 'ACTIVE'
    GROUP BY m.id HAVING COALESCE(SUM(b.quantity), 0) <= m.reorder_level
    ORDER BY m.code LIMIT 200`;
}
