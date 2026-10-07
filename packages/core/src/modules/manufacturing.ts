import { z } from "zod";
import type { Tx } from "@edge/db";
import { assertWarehouseAccess, can, requirePermission, type ServiceContext } from "../context";
import { AppError, notFound } from "../errors";
import { audit } from "../platform/audit";
import { postStock, reverseStock } from "../platform/inventory";
import { D, money, qty4, sum, ZERO } from "../platform/money";
import { nextNumber } from "../platform/numbering";
import { listQuerySchema, pageArgs, toPage } from "../platform/pagination";
import { assertTransition, MANUFACTURING_TRANSITIONS } from "../platform/state-machine";
import { optionalText, parse, uuid } from "../validation";
import { activeBomFor, calculateBom } from "./bom";
import { refreshSalesOrderStatus } from "./sales-orders";
import { notify } from "./notifications";

type MoStatus = "DRAFT" | "APPROVED" | "WAITING_MATERIALS" | "MATERIALS_ISSUED" | "IN_PRODUCTION" | "QUALITY_CHECK" | "COMPLETED" | "CANCELLED";

async function lockMo(tx: Tx, id: string) {
  await tx.$queryRaw`SELECT id FROM manufacturing_orders WHERE id = ${id}::uuid FOR UPDATE`;
  const mo = await tx.manufacturingOrder.findUnique({ where: { id }, include: { items: true } });
  if (!mo) throw notFound("manufacturing_order");
  return mo;
}

async function setStatus(tx: Tx, ctx: ServiceContext, mo: { id: string; number: string; status: MoStatus }, to: MoStatus, extra: Record<string, unknown> = {}) {
  assertTransition("manufacturing_order", MANUFACTURING_TRANSITIONS, mo.status, to);
  await tx.manufacturingOrder.update({ where: { id: mo.id }, data: { status: to, updatedById: ctx.actor.userId, ...extra } });
  await audit(tx, ctx, { action: `manufacturing.${to.toLowerCase()}`, entityType: "manufacturing_order", entityId: mo.id, entityNumber: mo.number, oldValues: { status: mo.status }, newValues: { status: to } });
}

// ───────────────────────── Queries ─────────────────────────

export const moListSchema = listQuerySchema.extend({
  status: z.enum(["DRAFT", "APPROVED", "WAITING_MATERIALS", "MATERIALS_ISSUED", "IN_PRODUCTION", "QUALITY_CHECK", "COMPLETED", "CANCELLED"]).optional(),
  salesOrderId: uuid.optional(),
  customerId: uuid.optional(),
  delayed: z.enum(["1"]).optional(),
});

export async function listManufacturingOrders(ctx: ServiceContext, input: unknown) {
  requirePermission(ctx, "manufacturing.view");
  const q = parse(moListSchema, input);
  const where = {
    ...(q.status ? { status: q.status } : {}),
    ...(q.salesOrderId ? { salesOrderId: q.salesOrderId } : {}),
    ...(q.customerId ? { customerId: q.customerId } : {}),
    ...(q.delayed ? { requiredDate: { lt: new Date() }, status: { notIn: ["COMPLETED" as const, "CANCELLED" as const] } } : {}),
    ...(q.q ? { OR: [{ number: { contains: q.q, mode: "insensitive" as const } }, { customer: { name: { contains: q.q, mode: "insensitive" as const } } }, { salesOrder: { number: { contains: q.q, mode: "insensitive" as const } } }] } : {}),
  };
  const [items, total] = await Promise.all([
    ctx.db.manufacturingOrder.findMany({
      where,
      select: {
        id: true, number: true, status: true, priority: true, quantity: true, width: true, height: true, thickness: true, requiredDate: true, createdAt: true,
        customer: { select: { id: true, name: true } }, product: { select: { id: true, code: true, name: true } }, salesOrder: { select: { id: true, number: true } },
        assignedTo: { select: { fullName: true } },
      },
      orderBy: [{ createdAt: "desc" }],
      ...pageArgs(q),
    }),
    ctx.db.manufacturingOrder.count({ where }),
  ]);
  return toPage(items, total, q);
}

export async function getManufacturingOrder(ctx: ServiceContext, id: string) {
  requirePermission(ctx, "manufacturing.view");
  const mo = await ctx.db.manufacturingOrder.findUnique({
    where: { id },
    include: {
      customer: { select: { id: true, name: true, phone: true } },
      product: { select: { id: true, code: true, name: true, images: { where: { isMain: true }, select: { id: true } } } },
      salesOrder: { select: { id: true, number: true } },
      salesOrderItem: { include: { quotationItem: { include: { options: true } } } },
      bom: { select: { id: true, version: true, name: true, overheadPercent: true } },
      measurementVersion: { include: { measurement: { select: { id: true, number: true } } } },
      assignedTo: { select: { id: true, fullName: true } },
      items: { include: { material: { select: { id: true, code: true, name: true, unit: { select: { name: true } }, category: { select: { costCategory: true } } } } }, orderBy: { material: { code: "asc" } } },
      materialIssues: { include: { warehouse: { select: { name: true } }, items: { include: { material: { select: { name: true } } } } }, orderBy: { createdAt: "asc" } },
      operations: { include: { stage: true, employee: { select: { id: true, fullName: true } } }, orderBy: { sequence: "asc" } },
      qualityChecks: { include: { inspector: { select: { fullName: true } } }, orderBy: { checkDate: "desc" } },
      expenses: { where: { status: "POSTED" }, select: { id: true, number: true, amount: true, description: true } },
    },
  });
  if (!mo) throw notFound("manufacturing_order");
  if (can(ctx.actor, "costing.view")) return mo;
  const hide = { estimatedMaterialCost: null, estimatedLaborCost: null, estimatedOverheadCost: null, actualMaterialCost: null, actualLaborCost: null, actualOverheadCost: null, actualOtherCost: null };
  return {
    ...mo, ...hide, expenses: [],
    items: mo.items.map((i) => ({ ...i, estimatedUnitCost: null, estimatedCost: null, actualCost: null })),
    materialIssues: mo.materialIssues.map((m) => ({ ...m, items: m.items.map((i) => ({ ...i, unitCost: null, totalCost: null })) })),
    operations: mo.operations.map((o) => ({ ...o, laborCost: null })),
  };
}

// ───────────────────────── Create / update ─────────────────────────

/** One manufacturing order per sales-order line that doesn't have an active one yet. */
export async function createFromSalesOrder(ctx: ServiceContext, salesOrderId: string) {
  requirePermission(ctx, "manufacturing.create");
  return ctx.db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM sales_orders WHERE id = ${salesOrderId}::uuid FOR UPDATE`;
    const so = await tx.salesOrder.findUnique({
      where: { id: salesOrderId },
      include: {
        items: {
          include: {
            quotationItem: { include: { measurement: { include: { versions: { where: { approvedAt: { not: null } }, orderBy: { version: "desc" }, take: 1 } } } } },
            mos: { where: { status: { not: "CANCELLED" } } },
            product: { select: { code: true, name: true } },
          },
        },
      },
    });
    if (!so) throw notFound("sales_order");
    if (so.status === "CANCELLED" || so.status === "CLOSED") throw new AppError("INVALID_TRANSITION", "errors.invalidTransition");
    const created = [];
    for (const item of so.items) {
      if (item.mos.length) continue;
      const bom = await activeBomFor(tx, item.productId);
      if (!bom) throw new AppError("CONFLICT", "errors.noActiveBom", { product: `${item.product.code} ${item.product.name}` });
      const qi = item.quotationItem;
      const mv = qi.measurement?.versions[0];
      const number = await nextNumber(tx, "MANUFACTURING_ORDER");
      const mo = await tx.manufacturingOrder.create({
        data: {
          number, salesOrderId, salesOrderItemId: item.id, customerId: so.customerId, productId: item.productId, bomId: bom.id,
          measurementVersionId: mv?.id ?? null, width: mv?.width ?? qi.width, height: mv?.height ?? qi.height, thickness: mv?.thickness ?? qi.thickness,
          quantity: item.quantity, requiredDate: so.requiredDate, createdById: ctx.actor.userId,
        },
      });
      await audit(tx, ctx, { action: "manufacturing.create", entityType: "manufacturing_order", entityId: mo.id, entityNumber: number, newValues: { salesOrder: so.number, line: item.lineNo } });
      created.push(mo);
    }
    if (!created.length) throw new AppError("CONFLICT", "errors.nothingToManufacture");
    return { items: created, id: created[0]!.id };
  });
}

export const moUpdateSchema = z.object({
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).optional(),
  requiredDate: z.coerce.date().nullable().optional(),
  assignedToId: uuid.nullable().optional(),
  notes: optionalText(2000),
});

/** Planning fields may change until completion; technical data (BOM, size, qty) is frozen after approval. */
export async function updateManufacturingOrder(ctx: ServiceContext, id: string, input: unknown) {
  requirePermission(ctx, "manufacturing.create");
  const data = parse(moUpdateSchema, input);
  return ctx.db.$transaction(async (tx) => {
    const mo = await lockMo(tx, id);
    if (mo.status === "COMPLETED" || mo.status === "CANCELLED") throw new AppError("IMMUTABLE", "errors.immutable");
    const updated = await tx.manufacturingOrder.update({ where: { id }, data: { ...data, updatedById: ctx.actor.userId } });
    await audit(tx, ctx, { action: "manufacturing.update", entityType: "manufacturing_order", entityId: id, entityNumber: mo.number, oldValues: { priority: mo.priority, requiredDate: mo.requiredDate, assignedToId: mo.assignedToId }, newValues: data });
    return updated;
  });
}

async function totalsOnHand(tx: Tx, materialIds: string[]) {
  const rows = await tx.inventoryBalance.groupBy({ by: ["materialId"], where: { materialId: { in: materialIds } }, _sum: { quantity: true } });
  return new Map(rows.map((r) => [r.materialId, D(r._sum.quantity ?? 0)]));
}

/** Explodes the BOM into material requirements + estimated cost, then checks stock. */
export async function approveManufacturingOrder(ctx: ServiceContext, id: string) {
  requirePermission(ctx, "manufacturing.approve");
  return ctx.db.$transaction(async (tx) => {
    const mo = await lockMo(tx, id);
    if (mo.status !== "DRAFT") throw new AppError("INVALID_TRANSITION", "errors.invalidTransition");
    const soi = await tx.salesOrderItem.findUniqueOrThrow({ where: { id: mo.salesOrderItemId }, include: { quotationItem: { include: { options: true } } } });
    const calc = await calculateBom(tx, mo.bomId, {
      width: Number(mo.width), height: Number(mo.height), thickness: mo.thickness ? Number(mo.thickness) : null, quantity: Number(mo.quantity),
      optionIds: soi.quotationItem.options.map((o) => o.optionId),
    });
    await tx.manufacturingOrderItem.createMany({
      data: calc.requirements.map((r) => ({
        manufacturingOrderId: id, bomItemId: r.bomItemId, materialId: r.materialId, requiredQuantity: r.quantity,
        estimatedUnitCost: r.unitCost, estimatedCost: r.cost,
      })),
    });
    const onHand = await totalsOnHand(tx, calc.requirements.map((r) => r.materialId));
    const short = calc.requirements.some((r) => (onHand.get(r.materialId) ?? ZERO).lessThan(r.quantity));
    await setStatus(tx, ctx, mo as never, "APPROVED", {
      approvedAt: new Date(), approvedById: ctx.actor.userId,
      estimatedMaterialCost: calc.materialCost, estimatedLaborCost: calc.laborCost, estimatedOverheadCost: calc.overheadCost,
    });
    if (short) {
      await setStatus(tx, ctx, { id, number: mo.number, status: "APPROVED" }, "WAITING_MATERIALS");
      await notify(tx, { type: "waiting_materials", permission: "purchases.create", params: { number: mo.number }, entityType: "manufacturing_order", entityId: id, dedupeKey: `waiting:${id}` });
    }
    await refreshSalesOrderStatus(tx, mo.salesOrderId);
    return tx.manufacturingOrder.findUniqueOrThrow({ where: { id } });
  });
}

/** Re-checks stock for an order waiting for materials (also run after goods receipts). */
export async function recheckMaterials(ctx: ServiceContext, id: string) {
  requirePermission(ctx, "manufacturing.view");
  return ctx.db.$transaction(async (tx) => {
    const mo = await lockMo(tx, id);
    if (mo.status !== "WAITING_MATERIALS") return mo;
    const onHand = await totalsOnHand(tx, mo.items.map((i) => i.materialId));
    const ok = mo.items.every((i) => (onHand.get(i.materialId) ?? ZERO).plus(D(i.issuedQuantity)).minus(D(i.returnedQuantity)).greaterThanOrEqualTo(D(i.requiredQuantity)));
    // Stock available again: the order may proceed to material issue (status stays; issue is allowed from WAITING_MATERIALS).
    return { ...mo, materialsAvailable: ok };
  });
}

// ───────────────────────── Material issue / return ─────────────────────────

export const issueSchema = z.object({
  type: z.enum(["ISSUE", "RETURN"]).default("ISSUE"),
  warehouseId: uuid,
  issueDate: z.coerce.date().optional(),
  notes: optionalText(1000),
  lines: z.array(z.object({ materialId: uuid, quantity: z.coerce.number().positive() })).max(200).optional(),
});

const ISSUABLE: MoStatus[] = ["APPROVED", "WAITING_MATERIALS", "MATERIALS_ISSUED", "IN_PRODUCTION", "QUALITY_CHECK"];

/** Drafts an issue (default: all outstanding requirements) or a return to stock. */
export async function createMaterialIssue(ctx: ServiceContext, moId: string, input: unknown) {
  requirePermission(ctx, "material_issues.create");
  const data = parse(issueSchema, input);
  assertWarehouseAccess(ctx.actor, data.warehouseId);
  return ctx.db.$transaction(async (tx) => {
    const mo = await lockMo(tx, moId);
    if (!ISSUABLE.includes(mo.status)) throw new AppError("INVALID_TRANSITION", "errors.moNotIssuable");
    const outstanding = (i: (typeof mo.items)[number]) => D(i.requiredQuantity).minus(D(i.issuedQuantity)).plus(D(i.returnedQuantity));
    let lines = data.lines;
    if (!lines) {
      if (data.type === "RETURN") throw new AppError("VALIDATION", "errors.validation", [{ path: "lines", code: "required" }]);
      lines = mo.items.filter((i) => outstanding(i).greaterThan(0)).map((i) => ({ materialId: i.materialId, quantity: outstanding(i).toNumber() }));
    }
    if (!lines.length) throw new AppError("VALIDATION", "errors.nothingToIssue");
    if (data.type === "RETURN") {
      for (const l of lines) {
        const it = mo.items.find((i) => i.materialId === l.materialId);
        const net = it ? D(it.issuedQuantity).minus(D(it.returnedQuantity)) : ZERO;
        if (D(l.quantity).greaterThan(net)) throw new AppError("VALIDATION", "errors.returnExceedsIssued", [{ path: "lines", code: "range" }]);
      }
    }
    const number = await nextNumber(tx, data.type === "ISSUE" ? "MATERIAL_ISSUE" : "MATERIAL_RETURN", data.issueDate ?? new Date());
    const mi = await tx.materialIssue.create({
      data: {
        number, type: data.type, manufacturingOrderId: moId, warehouseId: data.warehouseId, issueDate: data.issueDate ?? new Date(), notes: data.notes, createdById: ctx.actor.userId,
        items: { create: lines.map((l) => ({ materialId: l.materialId, quantity: l.quantity, moItemId: mo.items.find((i) => i.materialId === l.materialId)?.id ?? null })) },
      },
    });
    await audit(tx, ctx, { action: "material_issue.create", entityType: "material_issue", entityId: mi.id, entityNumber: number, newValues: { mo: mo.number, type: data.type, lines: lines.length } });
    return mi;
  });
}

async function recomputeMaterialCost(tx: Tx, moId: string) {
  const items = await tx.manufacturingOrderItem.findMany({ where: { manufacturingOrderId: moId } });
  await tx.manufacturingOrder.update({ where: { id: moId }, data: { actualMaterialCost: money(sum(items.map((i) => D(i.actualCost)))) } });
}

/**
 * Posts the issue: validates status, warehouse and stock, deducts inventory (row-locked),
 * costs lines at the moving average, updates MO requirements and actual cost — one DB transaction.
 */
export async function postMaterialIssue(ctx: ServiceContext, issueId: string) {
  requirePermission(ctx, "material_issues.post");
  return ctx.db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM material_issues WHERE id = ${issueId}::uuid FOR UPDATE`;
    const mi = await tx.materialIssue.findUnique({ where: { id: issueId }, include: { items: true } });
    if (!mi) throw notFound("material_issue");
    if (mi.status !== "DRAFT") throw new AppError("INVALID_TRANSITION", "errors.invalidTransition");
    assertWarehouseAccess(ctx.actor, mi.warehouseId);
    const mo = await lockMo(tx, mi.manufacturingOrderId);
    if (!ISSUABLE.includes(mo.status)) throw new AppError("INVALID_TRANSITION", "errors.moNotIssuable");
    const isIssue = mi.type === "ISSUE";

    const posted = await postStock(tx, ctx, { type: "material_issue", id: mi.id, number: mi.number, date: mi.issueDate },
      mi.items.map((it) => {
        const moItem = mo.items.find((x) => x.materialId === it.materialId);
        // Returns re-enter stock at the average cost they were issued at for this MO.
        const netQty = moItem ? D(moItem.issuedQuantity).minus(D(moItem.returnedQuantity)) : ZERO;
        const issuedCost = moItem && netQty.greaterThan(0) ? D(moItem.actualCost).div(netQty).toDecimalPlaces(4) : undefined;
        return {
          materialId: it.materialId, warehouseId: mi.warehouseId, quantity: isIssue ? D(it.quantity).negated() : D(it.quantity),
          unitCost: isIssue ? undefined : issuedCost, type: isIssue ? ("MATERIAL_ISSUE" as const) : ("PRODUCTION_RETURN" as const), notes: mo.number,
        };
      }),
    );

    for (const it of mi.items) {
      const p = posted.find((x) => x.materialId === it.materialId)!;
      const cost = money(D(it.quantity).times(p.unitCost));
      await tx.materialIssueItem.update({ where: { id: it.id }, data: { unitCost: p.unitCost, totalCost: cost } });
      const moItem = mo.items.find((x) => x.materialId === it.materialId);
      if (moItem) {
        await tx.manufacturingOrderItem.update({
          where: { id: moItem.id },
          data: isIssue
            ? { issuedQuantity: { increment: it.quantity }, actualCost: { increment: cost } }
            : { returnedQuantity: { increment: it.quantity }, actualCost: { decrement: cost } },
        });
      } else {
        // Unplanned material: tracked as a zero-requirement line so variance reporting sees it.
        const mat = await tx.material.findUniqueOrThrow({ where: { id: it.materialId }, select: { averageCost: true } });
        await tx.manufacturingOrderItem.create({
          data: { manufacturingOrderId: mo.id, materialId: it.materialId, requiredQuantity: 0, issuedQuantity: it.quantity, estimatedUnitCost: mat.averageCost, estimatedCost: 0, actualCost: cost },
        });
      }
    }
    await tx.materialIssue.update({ where: { id: mi.id }, data: { status: "POSTED", postedAt: new Date(), postedById: ctx.actor.userId } });
    await recomputeMaterialCost(tx, mo.id);

    if (isIssue && (mo.status === "APPROVED" || mo.status === "WAITING_MATERIALS")) {
      const items = await tx.manufacturingOrderItem.findMany({ where: { manufacturingOrderId: mo.id } });
      const complete = items.every((i) => D(i.issuedQuantity).minus(D(i.returnedQuantity)).greaterThanOrEqualTo(D(i.requiredQuantity)));
      if (complete) await setStatus(tx, ctx, mo as never, "MATERIALS_ISSUED");
    }
    await audit(tx, ctx, { action: "material_issue.post", entityType: "material_issue", entityId: mi.id, entityNumber: mi.number, newValues: { mo: mo.number, type: mi.type, cost: sum(posted.map((p) => p.totalCost.abs())) } });
    return tx.materialIssue.findUniqueOrThrow({ where: { id: mi.id }, include: { items: true } });
  });
}

export async function reverseMaterialIssue(ctx: ServiceContext, issueId: string, input: unknown) {
  requirePermission(ctx, "material_issues.reverse");
  const { reason } = parse(z.object({ reason: z.string().trim().min(1).max(500) }), input);
  return ctx.db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM material_issues WHERE id = ${issueId}::uuid FOR UPDATE`;
    const mi = await tx.materialIssue.findUnique({ where: { id: issueId }, include: { items: true } });
    if (!mi) throw notFound("material_issue");
    if (mi.status !== "POSTED") throw new AppError("INVALID_TRANSITION", "errors.invalidTransition");
    const mo = await lockMo(tx, mi.manufacturingOrderId);
    if (mo.status === "COMPLETED" || mo.status === "CANCELLED") throw new AppError("IMMUTABLE", "errors.immutable");
    await reverseStock(tx, ctx, { type: "material_issue", id: mi.id, number: mi.number, date: new Date() }, reason);
    for (const it of mi.items) {
      const moItem = mo.items.find((x) => x.materialId === it.materialId);
      if (!moItem) continue;
      const cost = D(it.totalCost ?? 0);
      await tx.manufacturingOrderItem.update({
        where: { id: moItem.id },
        data: mi.type === "ISSUE" ? { issuedQuantity: { decrement: it.quantity }, actualCost: { decrement: cost } } : { returnedQuantity: { decrement: it.quantity }, actualCost: { increment: cost } },
      });
    }
    await tx.materialIssue.update({ where: { id: mi.id }, data: { status: "REVERSED", reversedAt: new Date(), reversedById: ctx.actor.userId, reverseReason: reason } });
    await recomputeMaterialCost(tx, mo.id);
    await audit(tx, ctx, { action: "material_issue.reverse", entityType: "material_issue", entityId: mi.id, entityNumber: mi.number, newValues: { reason } });
  });
}

export async function getMaterialIssue(ctx: ServiceContext, id: string) {
  requirePermission(ctx, "material_issues.view");
  const mi = await ctx.db.materialIssue.findUnique({
    where: { id },
    include: {
      warehouse: true, manufacturingOrder: { select: { id: true, number: true, customer: { select: { name: true } }, product: { select: { name: true, code: true } } } },
      items: { include: { material: { select: { code: true, name: true, unit: { select: { name: true } } } } } },
    },
  });
  if (!mi) throw notFound("material_issue");
  if (!can(ctx.actor, "costing.view")) return { ...mi, items: mi.items.map((i) => ({ ...i, unitCost: null, totalCost: null })) };
  return mi;
}

export async function listMaterialIssues(ctx: ServiceContext, input: unknown) {
  requirePermission(ctx, "material_issues.view");
  const q = parse(listQuerySchema.extend({ status: z.enum(["DRAFT", "POSTED", "CANCELLED", "REVERSED"]).optional(), type: z.enum(["ISSUE", "RETURN"]).optional() }), input);
  const where = {
    ...(q.status ? { status: q.status } : {}),
    ...(q.type ? { type: q.type } : {}),
    ...(ctx.actor.warehouseIds.length && !ctx.actor.isSuperAdmin ? { warehouseId: { in: [...ctx.actor.warehouseIds] } } : {}),
    ...(q.q ? { OR: [{ number: { contains: q.q, mode: "insensitive" as const } }, { manufacturingOrder: { number: { contains: q.q, mode: "insensitive" as const } } }] } : {}),
  };
  const [items, total] = await Promise.all([
    ctx.db.materialIssue.findMany({
      where, include: { warehouse: { select: { name: true } }, manufacturingOrder: { select: { id: true, number: true } }, _count: { select: { items: true } } },
      orderBy: { createdAt: "desc" }, ...pageArgs(q),
    }),
    ctx.db.materialIssue.count({ where }),
  ]);
  return toPage(items, total, q);
}

// ───────────────────────── Production ─────────────────────────

export async function startProduction(ctx: ServiceContext, id: string) {
  requirePermission(ctx, "manufacturing.start");
  return ctx.db.$transaction(async (tx) => {
    const mo = await lockMo(tx, id);
    if (mo.status !== "MATERIALS_ISSUED") throw new AppError("INVALID_TRANSITION", "errors.materialsNotIssued");
    const stages = await tx.productionStage.findMany({ where: { status: "ACTIVE", isQcStage: false }, orderBy: { sequence: "asc" } });
    if (!stages.length) throw new AppError("CONFLICT", "errors.noStages");
    await tx.productionOperation.createMany({ data: stages.map((s, i) => ({ manufacturingOrderId: id, stageId: s.id, sequence: i + 1, quantity: mo.quantity })) });
    await setStatus(tx, ctx, mo as never, "IN_PRODUCTION", { startedAt: new Date() });
    await refreshSalesOrderStatus(tx, mo.salesOrderId);
    return tx.manufacturingOrder.findUniqueOrThrow({ where: { id } });
  });
}

export const operationSchema = z.object({
  action: z.enum(["start", "complete", "skip", "delay", "assign"]),
  employeeId: uuid.nullable().optional(),
  laborHours: z.coerce.number().min(0).max(10000).optional(),
  quantity: z.coerce.number().positive().optional(),
  delayReason: optionalText(500),
  notes: optionalText(1000),
});

export async function updateOperation(ctx: ServiceContext, operationId: string, input: unknown) {
  requirePermission(ctx, "production.update");
  const data = parse(operationSchema, input);
  return ctx.db.$transaction(async (tx) => {
    const op = await tx.productionOperation.findUnique({ where: { id: operationId }, include: { stage: true } });
    if (!op) throw notFound("operation");
    const mo = await lockMo(tx, op.manufacturingOrderId);
    if (mo.status !== "IN_PRODUCTION") throw new AppError("INVALID_TRANSITION", "errors.moNotInProduction");
    const now = new Date();
    const patch: Record<string, unknown> = { updatedById: ctx.actor.userId, ...(data.notes !== undefined ? { notes: data.notes } : {}), ...(data.employeeId !== undefined ? { employeeId: data.employeeId } : {}) };
    if (data.action === "start") {
      if (op.status !== "PENDING") throw new AppError("INVALID_TRANSITION", "errors.invalidTransition");
      Object.assign(patch, { status: "IN_PROGRESS", startedAt: now, employeeId: data.employeeId ?? op.employeeId ?? ctx.actor.userId });
    } else if (data.action === "complete") {
      if (op.status !== "IN_PROGRESS" && op.status !== "PENDING") throw new AppError("INVALID_TRANSITION", "errors.invalidTransition");
      const started = op.startedAt ?? now;
      const hours = data.laborHours ?? Math.round(((now.getTime() - started.getTime()) / 3_600_000) * 100) / 100;
      Object.assign(patch, { status: "COMPLETED", startedAt: started, endedAt: now, laborHours: hours, laborCost: money(D(hours).times(D(op.stage.laborRatePerHour))), quantity: data.quantity ?? op.quantity });
    } else if (data.action === "skip") {
      if (op.status === "COMPLETED") throw new AppError("INVALID_TRANSITION", "errors.invalidTransition");
      Object.assign(patch, { status: "SKIPPED", endedAt: now });
    } else if (data.action === "delay") {
      if (!data.delayReason) throw new AppError("VALIDATION", "errors.validation", [{ path: "delayReason", code: "required" }]);
      Object.assign(patch, { isDelayed: true, delayReason: data.delayReason });
    }
    await tx.productionOperation.update({ where: { id: operationId }, data: patch });
    const ops = await tx.productionOperation.findMany({ where: { manufacturingOrderId: mo.id } });
    await tx.manufacturingOrder.update({ where: { id: mo.id }, data: { actualLaborCost: money(sum(ops.map((o) => D(o.laborCost)))) } });
    await audit(tx, ctx, { action: `production.${data.action}`, entityType: "manufacturing_order", entityId: mo.id, entityNumber: mo.number, newValues: { stage: op.stage.code, ...data } });
    if (ops.every((o) => o.status === "COMPLETED" || o.status === "SKIPPED")) await setStatus(tx, ctx, mo as never, "QUALITY_CHECK");
    return tx.productionOperation.findUniqueOrThrow({ where: { id: operationId } });
  });
}

// ───────────────────────── Quality control ─────────────────────────

export const qcSchema = z.object({
  result: z.enum(["PASSED", "FAILED", "PASSED_WITH_NOTES"]),
  checklist: z.array(z.object({ item: z.string().trim().min(1).max(200), ok: z.boolean() })).max(50).default([]),
  defects: optionalText(2000),
  notes: optionalText(2000),
  reworkFromStageId: uuid.optional(),
});

/**
 * Records a QC inspection. PASSED / PASSED_WITH_NOTES completes the order (final actual cost,
 * sales order manufactured quantity). FAILED sends it back to production with rework operations.
 */
export async function recordQualityCheck(ctx: ServiceContext, moId: string, input: unknown) {
  requirePermission(ctx, "quality.create");
  const data = parse(qcSchema, input);
  if (data.result !== "PASSED" && !data.defects && !data.notes) throw new AppError("VALIDATION", "errors.qcNotesRequired", [{ path: "defects", code: "required" }]);
  return ctx.db.$transaction(async (tx) => {
    const mo = await lockMo(tx, moId);
    if (mo.status !== "QUALITY_CHECK") throw new AppError("INVALID_TRANSITION", "errors.moNotInQc");
    const number = await nextNumber(tx, "QUALITY_CHECK");
    const qc = await tx.qualityCheck.create({
      data: { number, manufacturingOrderId: moId, inspectorId: ctx.actor.userId, checkDate: new Date(), result: data.result, checklist: data.checklist, defects: data.defects, notes: data.notes },
    });
    await audit(tx, ctx, { action: "quality.check", entityType: "manufacturing_order", entityId: moId, entityNumber: mo.number, newValues: { qc: number, result: data.result } });
    if (data.result === "FAILED") {
      const stages = await tx.productionStage.findMany({ where: { status: "ACTIVE", isQcStage: false }, orderBy: { sequence: "asc" } });
      const from = data.reworkFromStageId ? stages.findIndex((s) => s.id === data.reworkFromStageId) : 0;
      const last = await tx.productionOperation.aggregate({ where: { manufacturingOrderId: moId }, _max: { sequence: true } });
      await tx.productionOperation.createMany({
        data: stages.slice(Math.max(from, 0)).map((s, i) => ({ manufacturingOrderId: moId, stageId: s.id, sequence: (last._max.sequence ?? 0) + i + 1, quantity: mo.quantity, notes: `Rework — ${number}` })),
      });
      await setStatus(tx, ctx, mo as never, "IN_PRODUCTION");
      await notify(tx, { type: "qc_failed", permission: "manufacturing.view", params: { number: mo.number, qc: number }, entityType: "manufacturing_order", entityId: moId, dedupeKey: `qc_failed:${qc.id}` });
    } else {
      await completeOrder(tx, ctx, mo);
    }
    return qc;
  });
}

export async function listQualityChecks(ctx: ServiceContext, input: unknown) {
  requirePermission(ctx, "quality.view");
  const q = parse(listQuerySchema.extend({ result: z.enum(["PASSED", "FAILED", "PASSED_WITH_NOTES"]).optional() }), input);
  const where = q.result ? { result: q.result } : {};
  const [items, total] = await Promise.all([
    ctx.db.qualityCheck.findMany({
      where,
      include: { manufacturingOrder: { select: { id: true, number: true, product: { select: { name: true } } } }, inspector: { select: { fullName: true } } },
      orderBy: { checkDate: "desc" },
      ...pageArgs(q),
    }),
    ctx.db.qualityCheck.count({ where }),
  ]);
  return toPage(items, total, q);
}

async function completeOrder(tx: Tx, ctx: ServiceContext, mo: Awaited<ReturnType<typeof lockMo>>) {
  const fresh = await tx.manufacturingOrder.findUniqueOrThrow({ where: { id: mo.id }, include: { bom: true } });
  const other = await tx.expense.aggregate({ where: { manufacturingOrderId: mo.id, status: "POSTED" }, _sum: { amount: true } });
  const material = D(fresh.actualMaterialCost);
  const labor = D(fresh.actualLaborCost);
  const overhead = money(material.plus(labor).times(D(fresh.bom.overheadPercent)).div(100));
  await setStatus(tx, ctx, mo as never, "COMPLETED", { completedAt: new Date(), actualOverheadCost: overhead, actualOtherCost: money(D(other._sum.amount ?? 0)) });
  await tx.salesOrderItem.update({ where: { id: mo.salesOrderItemId }, data: { manufacturedQuantity: { increment: mo.quantity } } });
  await refreshSalesOrderStatus(tx, mo.salesOrderId);
}

export async function cancelManufacturingOrder(ctx: ServiceContext, id: string, input: unknown) {
  requirePermission(ctx, "manufacturing.cancel");
  const { reason } = parse(z.object({ reason: z.string().trim().min(1).max(500) }), input);
  return ctx.db.$transaction(async (tx) => {
    const mo = await lockMo(tx, id);
    const net = mo.items.some((i) => D(i.issuedQuantity).minus(D(i.returnedQuantity)).greaterThan(0));
    if (net) throw new AppError("CONFLICT", "errors.returnMaterialsFirst");
    const drafts = await tx.materialIssue.count({ where: { manufacturingOrderId: id, status: "DRAFT" } });
    if (drafts) await tx.materialIssue.updateMany({ where: { manufacturingOrderId: id, status: "DRAFT" }, data: { status: "CANCELLED" } });
    await setStatus(tx, ctx, mo as never, "CANCELLED", { cancelledAt: new Date(), cancelReason: reason });
  });
}

// ───────────────────────── Costing ─────────────────────────

/** Estimated vs actual per material and per cost element for one MO. */
export async function costVariance(ctx: ServiceContext, id: string) {
  requirePermission(ctx, "costing.view");
  const mo = await ctx.db.manufacturingOrder.findUnique({
    where: { id },
    include: { items: { include: { material: { select: { code: true, name: true, unit: { select: { name: true } }, category: { select: { costCategory: true } } } } } } },
  });
  if (!mo) throw notFound("manufacturing_order");
  const lines = mo.items.map((i) => {
    const actualQty = qty4(D(i.issuedQuantity).minus(D(i.returnedQuantity)));
    return {
      materialId: i.materialId, code: i.material.code, name: i.material.name, unit: i.material.unit.name, costCategory: i.material.category.costCategory,
      estimatedQty: D(i.requiredQuantity), actualQty, qtyVariance: qty4(actualQty.minus(D(i.requiredQuantity))),
      estimatedCost: D(i.estimatedCost), actualCost: D(i.actualCost), costVariance: money(D(i.actualCost).minus(D(i.estimatedCost))),
    };
  });
  const estimated = { material: D(mo.estimatedMaterialCost), labor: D(mo.estimatedLaborCost), overhead: D(mo.estimatedOverheadCost), other: ZERO };
  const actual = { material: D(mo.actualMaterialCost), labor: D(mo.actualLaborCost), overhead: D(mo.actualOverheadCost), other: D(mo.actualOtherCost) };
  const totalE = money(sum(Object.values(estimated)));
  const totalA = money(sum(Object.values(actual)));
  return { lines, estimated, actual, estimatedTotal: totalE, actualTotal: totalA, variance: money(totalA.minus(totalE)) };
}
