import { z } from "zod";
import { requireAnyPermission, requirePermission, type ServiceContext } from "../context";
import { conflict, notFound } from "../errors";
import { audit, diff } from "../platform/audit";
import { listQuerySchema, pageArgs, toPage } from "../platform/pagination";
import { optionalText, parse, recordStatus, requiredText, uuid } from "../validation";

export const cashAccountSchema = z.object({
  code: z.string().trim().toUpperCase().min(1).max(20).regex(/^[A-Z0-9_-]+$/),
  name: requiredText(150),
  type: z.enum(["CASH", "BANK"]),
  showroomId: uuid.nullable().optional(),
  bankName: optionalText(150),
  accountNo: optionalText(60),
  status: recordStatus.default("ACTIVE"),
});

/** Balance = Σ IN − Σ OUT from immutable cash transactions. */
async function balances(ctx: ServiceContext, ids: string[]) {
  if (!ids.length) return new Map<string, number>();
  const rows = await ctx.db.cashTransaction.groupBy({ by: ["cashAccountId", "direction"], where: { cashAccountId: { in: ids } }, _sum: { amount: true } });
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.cashAccountId, (m.get(r.cashAccountId) ?? 0) + (r.direction === "IN" ? 1 : -1) * Number(r._sum.amount ?? 0));
  return m;
}

export async function listCashAccounts(ctx: ServiceContext) {
  requireAnyPermission(ctx, "cash_accounts.view", "payments.create", "supplier_payments.create", "expenses.create");
  const rows = await ctx.db.cashAccount.findMany({ include: { showroom: { select: { id: true, name: true } } }, orderBy: { code: "asc" } });
  const canSeeBalance = ctx.actor.isSuperAdmin || ctx.actor.permissions.has("cash_accounts.view");
  const bal = canSeeBalance ? await balances(ctx, rows.map((r) => r.id)) : new Map<string, number>();
  return rows.map((r) => ({ ...r, balance: canSeeBalance ? (bal.get(r.id) ?? 0) : null }));
}

export async function createCashAccount(ctx: ServiceContext, input: unknown) {
  requirePermission(ctx, "cash_accounts.manage");
  const data = parse(cashAccountSchema, input);
  if (await ctx.db.cashAccount.findUnique({ where: { code: data.code } })) throw conflict("errors.duplicate", { field: "code" });
  return ctx.db.$transaction(async (tx) => {
    const a = await tx.cashAccount.create({ data: { ...data, showroomId: data.showroomId ?? null } });
    await audit(tx, ctx, { action: "cash_account.create", entityType: "cash_account", entityId: a.id, entityNumber: a.code, newValues: data });
    return a;
  });
}

export async function updateCashAccount(ctx: ServiceContext, id: string, input: unknown) {
  requirePermission(ctx, "cash_accounts.manage");
  const data = parse(cashAccountSchema.omit({ code: true }).partial(), input);
  const before = await ctx.db.cashAccount.findUnique({ where: { id } });
  if (!before) throw notFound("cash_account");
  return ctx.db.$transaction(async (tx) => {
    const a = await tx.cashAccount.update({ where: { id }, data });
    const changes = diff(before as Record<string, unknown>, data);
    if (changes) await audit(tx, ctx, { action: "cash_account.update", entityType: "cash_account", entityId: id, entityNumber: before.code, ...changes });
    return a;
  });
}

export async function cashAccountStatement(ctx: ServiceContext, id: string, input: unknown) {
  requirePermission(ctx, "cash_accounts.view");
  const q = parse(listQuerySchema.extend({ from: z.coerce.date().optional(), to: z.coerce.date().optional() }), input);
  const where = { cashAccountId: id, ...(q.from || q.to ? { txDate: { ...(q.from ? { gte: q.from } : {}), ...(q.to ? { lte: q.to } : {}) } } : {}) };
  const [items, total] = await Promise.all([
    ctx.db.cashTransaction.findMany({ where, orderBy: { txDate: "desc" }, ...pageArgs(q) }),
    ctx.db.cashTransaction.count({ where }),
  ]);
  return toPage(items, total, q);
}
