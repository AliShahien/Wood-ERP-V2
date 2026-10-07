import { z } from "zod";
import { requireAnyPermission, requirePermission, type ServiceContext } from "../context";
import { conflict, notFound } from "../errors";
import { audit, diff } from "../platform/audit";
import { parse, recordStatus, requiredText } from "../validation";

export const stageSchema = z.object({
  code: z.string().trim().toUpperCase().min(1).max(30).regex(/^[A-Z0-9_]+$/),
  nameAr: requiredText(100),
  nameEn: requiredText(100),
  sequence: z.coerce.number().int().min(0).max(10000),
  laborRatePerHour: z.coerce.number().min(0).max(1e7).default(0),
  isQcStage: z.boolean().default(false),
  status: recordStatus.default("ACTIVE"),
});

export async function listStages(ctx: ServiceContext) {
  requireAnyPermission(ctx, "production.view", "manufacturing.view", "settings.view");
  return ctx.db.productionStage.findMany({ orderBy: { sequence: "asc" } });
}

export async function createStage(ctx: ServiceContext, input: unknown) {
  requirePermission(ctx, "settings.edit");
  const data = parse(stageSchema, input);
  if (await ctx.db.productionStage.findUnique({ where: { code: data.code } })) throw conflict("errors.duplicate", { field: "code" });
  return ctx.db.$transaction(async (tx) => {
    const s = await tx.productionStage.create({ data });
    await audit(tx, ctx, { action: "production_stage.create", entityType: "production_stage", entityId: s.id, entityNumber: s.code, newValues: data });
    return s;
  });
}

/** Rate changes apply to operations completed afterwards; completed operations keep their cost. */
export async function updateStage(ctx: ServiceContext, id: string, input: unknown) {
  requirePermission(ctx, "settings.edit");
  const data = parse(stageSchema.omit({ code: true }).partial(), input);
  const before = await ctx.db.productionStage.findUnique({ where: { id } });
  if (!before) throw notFound("production_stage");
  return ctx.db.$transaction(async (tx) => {
    const s = await tx.productionStage.update({ where: { id }, data });
    const changes = diff(before as Record<string, unknown>, data);
    if (changes) await audit(tx, ctx, { action: "production_stage.update", entityType: "production_stage", entityId: id, entityNumber: before.code, ...changes });
    return s;
  });
}

/** Shop-floor board: open operations of orders in production. */
export async function productionBoard(ctx: ServiceContext) {
  requirePermission(ctx, "production.view");
  return ctx.db.productionOperation.findMany({
    where: { status: { in: ["PENDING", "IN_PROGRESS"] }, manufacturingOrder: { status: "IN_PRODUCTION" } },
    include: {
      stage: true,
      employee: { select: { id: true, fullName: true } },
      manufacturingOrder: { select: { id: true, number: true, priority: true, requiredDate: true, quantity: true, width: true, height: true, product: { select: { name: true } }, customer: { select: { name: true } } } },
    },
    orderBy: [{ manufacturingOrder: { requiredDate: "asc" } }, { sequence: "asc" }],
    take: 500,
  });
}
