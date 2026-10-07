import { z } from "zod";
import { requireAnyPermission, requirePermission, type ServiceContext } from "../context";
import { AppError, conflict, notFound } from "../errors";
import { audit } from "../platform/audit";
import { postCash, reverseCash } from "../platform/ledger";
import { D, money } from "../platform/money";
import { nextNumber } from "../platform/numbering";
import { listQuerySchema, pageArgs, toPage } from "../platform/pagination";
import { optionalText, parse, recordStatus, requiredText, uuid } from "../validation";

export const categorySchema = z.object({
  code: z.string().trim().toUpperCase().min(1).max(30).regex(/^[A-Z0-9_]+$/),
  name: requiredText(100),
  isProductionCost: z.boolean().default(false),
  status: recordStatus.default("ACTIVE"),
});

export async function listCategories(ctx: ServiceContext) {
  requireAnyPermission(ctx, "expenses.view", "expenses.create");
  return ctx.db.expenseCategory.findMany({ orderBy: { code: "asc" } });
}

export async function createCategory(ctx: ServiceContext, input: unknown) {
  requirePermission(ctx, "expenses.create");
  const data = parse(categorySchema, input);
  if (await ctx.db.expenseCategory.findUnique({ where: { code: data.code } })) throw conflict("errors.duplicate", { field: "code" });
  return ctx.db.expenseCategory.create({ data });
}

export async function updateCategory(ctx: ServiceContext, id: string, input: unknown) {
  requirePermission(ctx, "expenses.create");
  const data = parse(categorySchema.omit({ code: true }).partial(), input);
  return ctx.db.expenseCategory.update({ where: { id }, data });
}

export const expenseSchema = z.object({
  categoryId: uuid,
  amount: z.coerce.number().positive().max(1e11),
  expenseDate: z.coerce.date().optional(),
  method: z.enum(["CASH", "BANK_TRANSFER", "CARD", "OTHER"]),
  cashAccountId: uuid,
  showroomId: uuid.nullable().optional(),
  manufacturingOrderId: uuid.nullable().optional(),
  description: requiredText(500),
});

export const expenseListSchema = listQuerySchema.extend({
  categoryId: uuid.optional(),
  showroomId: uuid.optional(),
  status: z.enum(["POSTED", "CANCELLED"]).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export async function listExpenses(ctx: ServiceContext, input: unknown) {
  requirePermission(ctx, "expenses.view");
  const q = parse(expenseListSchema, input);
  const where = {
    ...(q.categoryId ? { categoryId: q.categoryId } : {}),
    ...(q.showroomId ? { showroomId: q.showroomId } : {}),
    ...(q.status ? { status: q.status } : {}),
    ...(q.from || q.to ? { expenseDate: { ...(q.from ? { gte: q.from } : {}), ...(q.to ? { lte: q.to } : {}) } } : {}),
    ...(q.q ? { OR: [{ number: { contains: q.q, mode: "insensitive" as const } }, { description: { contains: q.q, mode: "insensitive" as const } }] } : {}),
  };
  const [items, total, sum] = await Promise.all([
    ctx.db.expense.findMany({
      where,
      include: { category: { select: { name: true } }, cashAccount: { select: { name: true } }, showroom: { select: { name: true } }, manufacturingOrder: { select: { id: true, number: true } } },
      orderBy: { expenseDate: "desc" },
      ...pageArgs(q),
    }),
    ctx.db.expense.count({ where }),
    ctx.db.expense.aggregate({ where: { ...where, status: "POSTED" }, _sum: { amount: true } }),
  ]);
  return { ...toPage(items, total, q), sum: Number(sum._sum.amount ?? 0) };
}

export async function getExpense(ctx: ServiceContext, id: string) {
  requirePermission(ctx, "expenses.view");
  const e = await ctx.db.expense.findUnique({ where: { id }, include: { category: true, cashAccount: true, showroom: true, manufacturingOrder: { select: { id: true, number: true } } } });
  if (!e) throw notFound("expense");
  return e;
}

/** Posts immediately: cash OUT from the chosen account. Linked to an MO it becomes "other production cost". */
export async function createExpense(ctx: ServiceContext, input: unknown) {
  requirePermission(ctx, "expenses.create");
  const data = parse(expenseSchema, input);
  return ctx.db.$transaction(async (tx) => {
    const cat = await tx.expenseCategory.findUnique({ where: { id: data.categoryId } });
    if (!cat || cat.status !== "ACTIVE") throw new AppError("VALIDATION", "errors.validation", [{ path: "categoryId", code: "invalid" }]);
    const account = await tx.cashAccount.findUnique({ where: { id: data.cashAccountId } });
    if (!account || account.status !== "ACTIVE") throw new AppError("VALIDATION", "errors.validation", [{ path: "cashAccountId", code: "invalid" }]);
    if (data.manufacturingOrderId) {
      const mo = await tx.manufacturingOrder.findUnique({ where: { id: data.manufacturingOrderId } });
      if (!mo || mo.status === "CANCELLED") throw new AppError("VALIDATION", "errors.validation", [{ path: "manufacturingOrderId", code: "invalid" }]);
    }
    const date = data.expenseDate ?? new Date();
    const number = await nextNumber(tx, "EXPENSE", date);
    const amount = money(D(data.amount));
    const e = await tx.expense.create({
      data: {
        number, categoryId: cat.id, amount, expenseDate: date, method: data.method, cashAccountId: account.id, showroomId: data.showroomId ?? null,
        manufacturingOrderId: data.manufacturingOrderId ?? null, description: data.description, createdById: ctx.actor.userId,
      },
    });
    await postCash(tx, ctx, { cashAccountId: account.id, date, direction: "OUT", amount, sourceType: "expense", sourceId: e.id, sourceNumber: number, description: `${cat.name}: ${data.description}` });
    if (data.manufacturingOrderId) {
      const agg = await tx.expense.aggregate({ where: { manufacturingOrderId: data.manufacturingOrderId, status: "POSTED" }, _sum: { amount: true } });
      await tx.manufacturingOrder.update({ where: { id: data.manufacturingOrderId }, data: { actualOtherCost: money(D(agg._sum.amount ?? 0)) } });
    }
    await audit(tx, ctx, { action: "expense.create", entityType: "expense", entityId: e.id, entityNumber: number, newValues: { amount, category: cat.code } });
    return e;
  });
}

export async function cancelExpense(ctx: ServiceContext, id: string, input: unknown) {
  requirePermission(ctx, "expenses.cancel");
  const { reason } = parse(z.object({ reason: z.string().trim().min(1).max(500) }), input);
  return ctx.db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM expenses WHERE id = ${id}::uuid FOR UPDATE`;
    const e = await tx.expense.findUnique({ where: { id } });
    if (!e) throw notFound("expense");
    if (e.status !== "POSTED") throw new AppError("INVALID_TRANSITION", "errors.invalidTransition");
    await reverseCash(tx, ctx, id, `Cancel: ${reason}`);
    await tx.expense.update({ where: { id }, data: { status: "CANCELLED", cancelledAt: new Date(), cancelledById: ctx.actor.userId, cancelReason: reason } });
    if (e.manufacturingOrderId) {
      const agg = await tx.expense.aggregate({ where: { manufacturingOrderId: e.manufacturingOrderId, status: "POSTED" }, _sum: { amount: true } });
      await tx.manufacturingOrder.update({ where: { id: e.manufacturingOrderId }, data: { actualOtherCost: money(D(agg._sum.amount ?? 0)) } });
    }
    await audit(tx, ctx, { action: "expense.cancel", entityType: "expense", entityId: id, entityNumber: e.number, newValues: { reason } });
  });
}
