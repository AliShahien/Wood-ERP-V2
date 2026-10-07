import { z } from "zod";
import { assertInShowroomScope, can, requirePermission, showroomScopeWhere, type ServiceContext } from "../context";
import { AppError, notFound } from "../errors";
import { audit, diff } from "../platform/audit";
import { nextNumber } from "../platform/numbering";
import { listQuerySchema, orderBy, pageArgs, toPage } from "../platform/pagination";
import { searchWhere } from "../platform/query";
import { email, optionalText, parse, phone, recordStatus, requiredText, uuid } from "../validation";

export const customerSchema = z.object({
  name: requiredText(200),
  phone,
  whatsapp: phone,
  email,
  address: optionalText(300),
  governorate: optionalText(100),
  city: optionalText(100),
  taxNumber: optionalText(50),
  notes: optionalText(2000),
  showroomId: uuid.nullable().optional(),
  status: recordStatus.default("ACTIVE"),
});

export const customerListSchema = listQuerySchema.extend({ status: recordStatus.optional(), showroomId: uuid.optional() });

const listSelect = {
  id: true, code: true, name: true, phone: true, whatsapp: true, city: true, governorate: true, status: true, createdAt: true,
  showroomId: true, createdById: true, showroom: { select: { id: true, code: true, name: true } },
} as const;

export async function listCustomers(ctx: ServiceContext, input: unknown) {
  requirePermission(ctx, "customers.view");
  const q = parse(customerListSchema, input);
  const where = {
    deletedAt: null,
    ...showroomScopeWhere(ctx.actor),
    ...(q.status ? { status: q.status } : {}),
    ...(q.showroomId ? { showroomId: q.showroomId } : {}),
    ...searchWhere(q.q, ["name", "code", "email"], ["phone", "whatsapp"]),
  };
  const [items, total] = await Promise.all([
    ctx.db.customer.findMany({ where, select: listSelect, orderBy: orderBy(q, ["code", "name", "createdAt"], "createdAt"), ...pageArgs(q) }),
    ctx.db.customer.count({ where }),
  ]);
  return toPage(items, total, q);
}

async function loadScoped(ctx: ServiceContext, id: string) {
  const c = await ctx.db.customer.findFirst({ where: { id, deletedAt: null } });
  if (!c) throw notFound("customer");
  assertInShowroomScope(ctx.actor, c);
  return c;
}

/** Balance from the receivables ledger: Σ(debit − credit). Positive = customer owes us. */
export async function customerBalance(ctx: Pick<ServiceContext, "db">, customerId: string) {
  const agg = await ctx.db.partyLedgerEntry.aggregate({ where: { customerId }, _sum: { debit: true, credit: true } });
  return Number(agg._sum.debit ?? 0) - Number(agg._sum.credit ?? 0);
}

export async function getCustomer(ctx: ServiceContext, id: string) {
  requirePermission(ctx, "customers.view");
  const c = await loadScoped(ctx, id);
  const [showroom, addresses, contacts, counts, balance] = await Promise.all([
    c.showroomId ? ctx.db.showroom.findUnique({ where: { id: c.showroomId }, select: { id: true, code: true, name: true } }) : null,
    ctx.db.customerAddress.findMany({ where: { customerId: id, deletedAt: null } }),
    ctx.db.customerContact.findMany({ where: { customerId: id, deletedAt: null } }),
    ctx.db.customer.findUnique({
      where: { id },
      select: { _count: { select: { quotations: true, salesOrders: true, mos: true, invoices: true, payments: true, deliveries: true } } },
    }),
    can(ctx.actor, "payments.view") || can(ctx.actor, "invoices.view") ? customerBalance(ctx, id) : null,
  ]);
  return { ...c, showroom, addresses, contacts, counts: counts?._count, balance };
}

function resolveShowroom(ctx: ServiceContext, requested: string | null | undefined): string | null {
  // Scoped users can only create customers in their own showroom.
  if (ctx.actor.isSuperAdmin || ctx.actor.dataScope === "ALL") return requested ?? ctx.actor.showroomId;
  if (!ctx.actor.showroomId) throw new AppError("FORBIDDEN", "errors.noShowroom");
  return ctx.actor.showroomId;
}

export async function createCustomer(ctx: ServiceContext, input: unknown) {
  requirePermission(ctx, "customers.create");
  const data = parse(customerSchema, input);
  const showroomId = resolveShowroom(ctx, data.showroomId);
  return ctx.db.$transaction(async (tx) => {
    const code = await nextNumber(tx, "CUSTOMER");
    const c = await tx.customer.create({
      data: { ...data, phone: data.phone ?? null, whatsapp: data.whatsapp ?? null, email: data.email ?? null, showroomId, code, createdById: ctx.actor.userId },
    });
    await audit(tx, ctx, { action: "customer.create", entityType: "customer", entityId: c.id, entityNumber: code, newValues: data });
    return c;
  });
}

export async function updateCustomer(ctx: ServiceContext, id: string, input: unknown) {
  requirePermission(ctx, "customers.edit");
  const data = parse(customerSchema.partial(), input);
  const before = await loadScoped(ctx, id);
  if (data.showroomId !== undefined) data.showroomId = resolveShowroom(ctx, data.showroomId);
  return ctx.db.$transaction(async (tx) => {
    const c = await tx.customer.update({ where: { id }, data: { ...data, updatedById: ctx.actor.userId } });
    const changes = diff(before as Record<string, unknown>, data);
    if (changes) await audit(tx, ctx, { action: "customer.update", entityType: "customer", entityId: id, entityNumber: before.code, ...changes });
    return c;
  });
}

/** Soft delete only when the customer has no business documents. */
export async function deleteCustomer(ctx: ServiceContext, id: string) {
  requirePermission(ctx, "customers.delete");
  const c = await loadScoped(ctx, id);
  const docs = await ctx.db.customer.findUnique({
    where: { id },
    select: { _count: { select: { quotations: true, salesOrders: true, invoices: true, payments: true, measurements: true } } },
  });
  if (docs && Object.values(docs._count).some((n) => n > 0)) throw new AppError("CONFLICT", "errors.inUse");
  await ctx.db.$transaction(async (tx) => {
    await tx.customer.update({ where: { id }, data: { deletedAt: new Date(), deletedById: ctx.actor.userId, status: "INACTIVE" } });
    await audit(tx, ctx, { action: "customer.delete", entityType: "customer", entityId: id, entityNumber: c.code });
  });
}

const addressSchema = z.object({
  label: optionalText(50), address: requiredText(300), governorate: optionalText(100), city: optionalText(100), isDefault: z.boolean().default(false),
});
const contactSchema = z.object({ name: requiredText(150), phone, email, role: optionalText(100) });

export async function addAddress(ctx: ServiceContext, customerId: string, input: unknown) {
  requirePermission(ctx, "customers.edit");
  await loadScoped(ctx, customerId);
  const data = parse(addressSchema, input);
  return ctx.db.customerAddress.create({ data: { ...data, customerId } });
}

export async function addContact(ctx: ServiceContext, customerId: string, input: unknown) {
  requirePermission(ctx, "customers.edit");
  await loadScoped(ctx, customerId);
  const data = parse(contactSchema, input);
  return ctx.db.customerContact.create({ data: { ...data, phone: data.phone ?? null, email: data.email ?? null, customerId } });
}

export async function removeAddress(ctx: ServiceContext, customerId: string, addressId: string) {
  requirePermission(ctx, "customers.edit");
  await loadScoped(ctx, customerId);
  await ctx.db.customerAddress.updateMany({ where: { id: addressId, customerId }, data: { deletedAt: new Date() } });
}

export async function removeContact(ctx: ServiceContext, customerId: string, contactId: string) {
  requirePermission(ctx, "customers.edit");
  await loadScoped(ctx, customerId);
  await ctx.db.customerContact.updateMany({ where: { id: contactId, customerId }, data: { deletedAt: new Date() } });
}

export { loadScoped as loadScopedCustomer };
