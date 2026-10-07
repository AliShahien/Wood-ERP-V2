import { z } from "zod";
import { requirePermission, type ServiceContext } from "../context";
import { AppError, conflict, notFound } from "../errors";
import { audit, diff } from "../platform/audit";
import { listQuerySchema, orderBy, pageArgs, toPage } from "../platform/pagination";
import { searchWhere } from "../platform/query";
import { optionalText, parse, phone, recordStatus, requiredText, uuid } from "../validation";

export const showroomSchema = z.object({
  code: z.string().trim().toUpperCase().min(1).max(20).regex(/^[A-Z0-9-]+$/),
  name: requiredText(150),
  address: optionalText(300),
  phone,
  managerId: uuid.nullable().optional(),
  status: recordStatus.default("ACTIVE"),
});

const include = { manager: { select: { id: true, fullName: true } }, _count: { select: { users: true, customers: true } } } as const;

export async function listShowrooms(ctx: ServiceContext, input: unknown) {
  requirePermission(ctx, "showrooms.view");
  const q = parse(listQuerySchema.extend({ status: recordStatus.optional() }), input);
  const where = { deletedAt: null, ...(q.status ? { status: q.status } : {}), ...searchWhere(q.q, ["name", "code", "address"]) };
  const [items, total] = await Promise.all([
    ctx.db.showroom.findMany({ where, include, orderBy: orderBy(q, ["code", "name", "createdAt"], "code"), ...pageArgs(q) }),
    ctx.db.showroom.count({ where }),
  ]);
  return toPage(items, total, q);
}

export async function getShowroom(ctx: ServiceContext, id: string) {
  requirePermission(ctx, "showrooms.view");
  const s = await ctx.db.showroom.findFirst({ where: { id, deletedAt: null }, include });
  if (!s) throw notFound("showroom");
  return s;
}

export async function createShowroom(ctx: ServiceContext, input: unknown) {
  requirePermission(ctx, "showrooms.create");
  const data = parse(showroomSchema, input);
  if (await ctx.db.showroom.findUnique({ where: { code: data.code } })) throw conflict("errors.duplicate", { field: "code" });
  return ctx.db.$transaction(async (tx) => {
    const s = await tx.showroom.create({ data: { ...data, phone: data.phone ?? null, managerId: data.managerId ?? null, createdById: ctx.actor.userId } });
    await audit(tx, ctx, { action: "showroom.create", entityType: "showroom", entityId: s.id, entityNumber: s.code, newValues: data });
    return s;
  });
}

export async function updateShowroom(ctx: ServiceContext, id: string, input: unknown) {
  requirePermission(ctx, "showrooms.edit");
  const data = parse(showroomSchema.omit({ code: true }).partial(), input);
  const before = await ctx.db.showroom.findFirst({ where: { id, deletedAt: null } });
  if (!before) throw notFound("showroom");
  return ctx.db.$transaction(async (tx) => {
    const s = await tx.showroom.update({ where: { id }, data: { ...data, updatedById: ctx.actor.userId } });
    const changes = diff(before as Record<string, unknown>, data);
    if (changes) await audit(tx, ctx, { action: "showroom.update", entityType: "showroom", entityId: id, entityNumber: before.code, ...changes });
    return s;
  });
}

/** Soft delete; refused while users or customers still belong to it. */
export async function deleteShowroom(ctx: ServiceContext, id: string) {
  requirePermission(ctx, "showrooms.delete");
  const s = await ctx.db.showroom.findFirst({ where: { id, deletedAt: null }, include: { _count: { select: { users: true, customers: true, quotations: true } } } });
  if (!s) throw notFound("showroom");
  if (s._count.users || s._count.customers || s._count.quotations) throw new AppError("CONFLICT", "errors.inUse");
  await ctx.db.$transaction(async (tx) => {
    await tx.showroom.update({ where: { id }, data: { deletedAt: new Date(), deletedById: ctx.actor.userId, status: "INACTIVE" } });
    await audit(tx, ctx, { action: "showroom.delete", entityType: "showroom", entityId: id, entityNumber: s.code });
  });
}
