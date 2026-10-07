import { z } from "zod";
import { can, requirePermission, type ServiceContext } from "../context";
import { AppError, notFound } from "../errors";
import { audit, diff } from "../platform/audit";
import { nextNumber } from "../platform/numbering";
import { listQuerySchema, orderBy, pageArgs, toPage } from "../platform/pagination";
import { searchWhere } from "../platform/query";
import { email, optionalText, parse, phone, recordStatus, requiredText } from "../validation";

export const supplierSchema = z.object({
  name: requiredText(200),
  contactPerson: optionalText(150),
  phone,
  whatsapp: phone,
  email,
  address: optionalText(300),
  taxNumber: optionalText(50),
  notes: optionalText(2000),
  status: recordStatus.default("ACTIVE"),
});

export async function listSuppliers(ctx: ServiceContext, input: unknown) {
  requirePermission(ctx, "suppliers.view");
  const q = parse(listQuerySchema.extend({ status: recordStatus.optional() }), input);
  const where = { deletedAt: null, ...(q.status ? { status: q.status } : {}), ...searchWhere(q.q, ["name", "code", "contactPerson", "email"], ["phone", "whatsapp"]) };
  const [items, total] = await Promise.all([
    ctx.db.supplier.findMany({ where, orderBy: orderBy(q, ["code", "name", "createdAt"], "createdAt"), ...pageArgs(q) }),
    ctx.db.supplier.count({ where }),
  ]);
  return toPage(items, total, q);
}

/** Payables balance: Σ(credit − debit). Positive = we owe the supplier. */
export async function supplierBalance(ctx: Pick<ServiceContext, "db">, supplierId: string) {
  const agg = await ctx.db.partyLedgerEntry.aggregate({ where: { supplierId }, _sum: { debit: true, credit: true } });
  return Number(agg._sum.credit ?? 0) - Number(agg._sum.debit ?? 0);
}

export async function getSupplier(ctx: ServiceContext, id: string) {
  requirePermission(ctx, "suppliers.view");
  const s = await ctx.db.supplier.findFirst({
    where: { id, deletedAt: null },
    include: {
      contacts: { where: { deletedAt: null } },
      _count: { select: { purchaseOrders: true, goodsReceipts: true, invoices: true, payments: true } },
    },
  });
  if (!s) throw notFound("supplier");
  const balance = can(ctx.actor, "supplier_payments.view") || can(ctx.actor, "supplier_invoices.view") ? await supplierBalance(ctx, id) : null;
  const materials = await ctx.db.material.findMany({
    where: { OR: [{ defaultSupplierId: id }, { goodsReceiptItems: { some: { goodsReceipt: { supplierId: id, status: "POSTED" } } } }] },
    select: { id: true, code: true, name: true },
    take: 50,
  });
  return { ...s, balance, materials };
}

export async function createSupplier(ctx: ServiceContext, input: unknown) {
  requirePermission(ctx, "suppliers.create");
  const data = parse(supplierSchema, input);
  return ctx.db.$transaction(async (tx) => {
    const code = await nextNumber(tx, "SUPPLIER");
    const s = await tx.supplier.create({
      data: { ...data, phone: data.phone ?? null, whatsapp: data.whatsapp ?? null, email: data.email ?? null, code, createdById: ctx.actor.userId },
    });
    await audit(tx, ctx, { action: "supplier.create", entityType: "supplier", entityId: s.id, entityNumber: code, newValues: data });
    return s;
  });
}

export async function updateSupplier(ctx: ServiceContext, id: string, input: unknown) {
  requirePermission(ctx, "suppliers.edit");
  const data = parse(supplierSchema.partial(), input);
  const before = await ctx.db.supplier.findFirst({ where: { id, deletedAt: null } });
  if (!before) throw notFound("supplier");
  return ctx.db.$transaction(async (tx) => {
    const s = await tx.supplier.update({ where: { id }, data: { ...data, updatedById: ctx.actor.userId } });
    const changes = diff(before as Record<string, unknown>, data);
    if (changes) await audit(tx, ctx, { action: "supplier.update", entityType: "supplier", entityId: id, entityNumber: before.code, ...changes });
    return s;
  });
}

export async function deleteSupplier(ctx: ServiceContext, id: string) {
  requirePermission(ctx, "suppliers.delete");
  const s = await ctx.db.supplier.findFirst({ where: { id, deletedAt: null }, include: { _count: { select: { purchaseOrders: true, goodsReceipts: true, invoices: true, payments: true } } } });
  if (!s) throw notFound("supplier");
  if (Object.values(s._count).some((n) => n > 0)) throw new AppError("CONFLICT", "errors.inUse");
  await ctx.db.$transaction(async (tx) => {
    await tx.supplier.update({ where: { id }, data: { deletedAt: new Date(), deletedById: ctx.actor.userId, status: "INACTIVE" } });
    await audit(tx, ctx, { action: "supplier.delete", entityType: "supplier", entityId: id, entityNumber: s.code });
  });
}

export async function addSupplierContact(ctx: ServiceContext, supplierId: string, input: unknown) {
  requirePermission(ctx, "suppliers.edit");
  const data = parse(z.object({ name: requiredText(150), phone, email, role: optionalText(100) }), input);
  const s = await ctx.db.supplier.findFirst({ where: { id: supplierId, deletedAt: null } });
  if (!s) throw notFound("supplier");
  return ctx.db.supplierContact.create({ data: { ...data, phone: data.phone ?? null, email: data.email ?? null, supplierId } });
}
