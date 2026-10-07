import { z } from "zod";
import type { Tx } from "@edge/db";
import { assertInShowroomScope, can, requirePermission, showroomScopeWhere, type ServiceContext } from "../context";
import { AppError, notFound } from "../errors";
import { audit } from "../platform/audit";
import { D, money } from "../platform/money";
import { nextNumber } from "../platform/numbering";
import { listQuerySchema, pageArgs, toPage } from "../platform/pagination";
import { searchWhere } from "../platform/query";
import { assertTransition, QUOTATION_TRANSITIONS } from "../platform/state-machine";
import { optionalText, parse, uuid } from "../validation";
import { computeTotals, unitPrice } from "./pricing";
import { readSettings } from "./settings";
import { loadScopedCustomer } from "./customers";
import { activeBomFor, calculateBom } from "./bom";
import { notify } from "./notifications";

const num = (min = 0, max = 1e10) => z.coerce.number().min(min).max(max);

export const quotationItemSchema = z.object({
  productId: uuid,
  measurementId: uuid.nullable().optional(),
  description: optionalText(500),
  width: num(1, 10000),
  height: num(1, 10000),
  thickness: num(1, 1000).nullable().optional(),
  quantity: num(0.0001, 100000),
  optionIds: z.array(uuid).max(50).default([]),
  /** Omit to use the calculated price. Changing it requires quotations.override_price. */
  unitPrice: num(0).nullable().optional(),
  discount: num(0).default(0),
  notes: optionalText(1000),
});

export const quotationSchema = z.object({
  customerId: uuid,
  showroomId: uuid.nullable().optional(),
  salespersonId: uuid.nullable().optional(),
  quotationDate: z.coerce.date().optional(),
  validUntil: z.coerce.date().optional(),
  items: z.array(quotationItemSchema).min(1).max(200),
  discountType: z.enum(["AMOUNT", "PERCENT"]).default("AMOUNT"),
  discountValue: num(0).default(0),
  installationCharge: num(0).default(0),
  transportationCharge: num(0).default(0),
  taxEnabled: z.boolean().optional(),
  taxRate: num(0, 100).optional(),
  depositRequired: num(0).nullable().optional(),
  paymentTerms: optionalText(1000),
  notes: optionalText(4000),
});

export const quotationListSchema = listQuerySchema.extend({
  status: z.enum(["DRAFT", "SUBMITTED", "APPROVED", "REJECTED", "EXPIRED", "CONVERTED", "CANCELLED"]).optional(),
  customerId: uuid.optional(),
  showroomId: uuid.optional(),
});

const scope = (ctx: ServiceContext) => showroomScopeWhere(ctx.actor, { ownerFields: ["createdById", "salespersonId"] });

export async function listQuotations(ctx: ServiceContext, input: unknown) {
  requirePermission(ctx, "quotations.view");
  const q = parse(quotationListSchema, input);
  const where = {
    ...scope(ctx),
    ...(q.status ? { status: q.status } : {}),
    ...(q.customerId ? { customerId: q.customerId } : {}),
    ...(q.showroomId ? { showroomId: q.showroomId } : {}),
    ...(q.q ? { OR: [...(searchWhere(q.q, ["number"]).OR ?? []), { customer: { name: { contains: q.q, mode: "insensitive" as const } } }, { customer: { phone: { contains: q.q } } }] } : {}),
  };
  const [items, total] = await Promise.all([
    ctx.db.quotation.findMany({
      where,
      select: {
        id: true, number: true, revision: true, status: true, quotationDate: true, validUntil: true, total: true, currency: true,
        customer: { select: { id: true, code: true, name: true } }, showroom: { select: { id: true, name: true } }, salesperson: { select: { id: true, fullName: true } },
      },
      orderBy: { createdAt: "desc" },
      ...pageArgs(q),
    }),
    ctx.db.quotation.count({ where }),
  ]);
  return toPage(items, total, q);
}

export async function getQuotation(ctx: ServiceContext, id: string) {
  requirePermission(ctx, "quotations.view");
  const qt = await ctx.db.quotation.findUnique({
    where: { id },
    include: {
      customer: true,
      showroom: { select: { id: true, code: true, name: true, address: true, phone: true } },
      salesperson: { select: { id: true, fullName: true } },
      items: {
        orderBy: { lineNo: "asc" },
        include: { product: { select: { id: true, code: true, name: true, images: { where: { isMain: true }, select: { id: true } } } }, options: true, measurement: { select: { id: true, number: true } } },
      },
      salesOrder: { select: { id: true, number: true } },
      parent: { select: { id: true, number: true } },
      revisions: { select: { id: true, number: true, status: true }, orderBy: { revision: "asc" } },
    },
  });
  if (!qt) throw notFound("quotation");
  assertInShowroomScope(ctx.actor, qt);
  if (!can(ctx.actor, "costing.view")) {
    return { ...qt, estimatedCost: null, items: qt.items.map((i) => ({ ...i, estimatedUnitCost: null })) };
  }
  return qt;
}

/** Validates products/options/dimensions and prices every line. */
async function buildLines(tx: Tx, ctx: ServiceContext, items: z.infer<typeof quotationItemSchema>[]) {
  const productIds = [...new Set(items.map((i) => i.productId))];
  const products = await tx.product.findMany({ where: { id: { in: productIds }, deletedAt: null }, include: { availableOptions: { include: { option: true } } } });
  const byId = new Map(products.map((p) => [p.id, p]));
  const canOverride = can(ctx.actor, "quotations.override_price");
  return items.map((it, idx) => {
    const p = byId.get(it.productId);
    const path = `items.${idx}`;
    if (!p || p.status !== "ACTIVE") throw new AppError("VALIDATION", "errors.productNotSellable", [{ path: `${path}.productId`, code: "inactive" }]);
    const out = (v: number, min: unknown, max: unknown) => (min != null && v < Number(min)) || (max != null && v > Number(max));
    if (out(it.width, p.minWidth, p.maxWidth) || out(it.height, p.minHeight, p.maxHeight)) {
      throw new AppError("VALIDATION", "errors.sizeOutOfRange", [{ path: `${path}.width`, code: "range" }]);
    }
    const available = new Map(p.availableOptions.map((a) => [a.optionId, a]));
    const chosen = [...new Set(it.optionIds)].map((oid) => {
      const a = available.get(oid);
      if (!a || a.option.status !== "ACTIVE") throw new AppError("VALIDATION", "errors.optionNotAvailable", [{ path: `${path}.optionIds`, code: "invalid" }]);
      return { option: a.option, adj: a.priceOverride ?? a.option.priceAdjustment };
    });
    const calculated = unitPrice({
      pricingMethod: p.pricingMethod, basePrice: p.basePrice, width: it.width, height: it.height,
      options: chosen.map((c) => ({ priceMethod: c.option.priceMethod, priceAdjustment: c.adj })),
    });
    let price = calculated;
    if (it.unitPrice != null && !money(D(it.unitPrice)).equals(calculated)) {
      if (!canOverride) throw new AppError("FORBIDDEN", "errors.priceOverrideForbidden", { permission: "quotations.override_price" });
      price = money(D(it.unitPrice));
    }
    return { lineNo: idx + 1, input: it, product: p, chosen, unitPrice: price };
  });
}

async function resolveHeader(ctx: ServiceContext, data: z.infer<typeof quotationSchema>) {
  const customer = await loadScopedCustomer(ctx, data.customerId);
  let showroomId = data.showroomId ?? customer.showroomId ?? ctx.actor.showroomId;
  if (!(ctx.actor.isSuperAdmin || ctx.actor.dataScope === "ALL")) showroomId = ctx.actor.showroomId;
  if (!showroomId) throw new AppError("VALIDATION", "errors.showroomRequired", [{ path: "showroomId", code: "required" }]);
  const salespersonId = can(ctx.actor, "quotations.approve") && data.salespersonId ? data.salespersonId : ctx.actor.userId;
  return { customer, showroomId, salespersonId };
}

function totalsFor(data: z.infer<typeof quotationSchema>, lines: Awaited<ReturnType<typeof buildLines>>, settings: Awaited<ReturnType<typeof readSettings>>) {
  const taxEnabled = data.taxEnabled ?? settings["finance.taxEnabledByDefault"];
  const taxRate = taxEnabled ? (data.taxRate ?? settings["finance.defaultTaxRate"]) : 0;
  try {
    const totals = computeTotals({
      lines: lines.map((l) => ({ quantity: l.input.quantity, unitPrice: l.unitPrice, discount: l.input.discount })),
      discountType: data.discountType, discountValue: data.discountValue,
      installationCharge: data.installationCharge, transportationCharge: data.transportationCharge,
      taxEnabled, taxRate,
    });
    const deposit = data.depositRequired != null ? D(data.depositRequired) : money(totals.total.times(settings["sales.defaultDepositPercent"]).div(100));
    if (deposit.greaterThan(totals.total)) throw new RangeError("deposit");
    return { totals, taxEnabled, taxRate, deposit };
  } catch (e) {
    if (e instanceof RangeError) throw new AppError("VALIDATION", "errors.discountTooLarge", [{ path: "discountValue", code: "range" }]);
    throw e;
  }
}

/** Estimated unit cost per line from the product's ACTIVE BOM (null when there is no BOM). */
async function estimateCosts(tx: Tx, lines: Awaited<ReturnType<typeof buildLines>>) {
  const out: (ReturnType<typeof D> | null)[] = [];
  for (const l of lines) {
    const bom = await activeBomFor(tx, l.product.id);
    if (!bom) { out.push(null); continue; }
    try {
      const c = await calculateBom(tx, bom.id, { width: l.input.width, height: l.input.height, thickness: l.input.thickness ?? null, quantity: 1, optionIds: l.chosen.map((c) => c.option.id) });
      out.push(c.totalCost);
    } catch {
      out.push(null); // a broken BOM must not block selling; the MO approval will surface it
    }
  }
  const total = lines.reduce((s, l, i) => (out[i] ? s.plus(out[i]!.times(l.input.quantity)) : s), D(0));
  return { unitCosts: out, total: out.some((c) => c) ? money(total) : null };
}

function itemRows(lines: Awaited<ReturnType<typeof buildLines>>, lineTotals: ReturnType<typeof computeTotals>["lineTotals"], unitCosts: (ReturnType<typeof D> | null)[] = []) {
  return lines.map((l, i) => ({
    estimatedUnitCost: unitCosts[i] ?? null,
    lineNo: l.lineNo,
    productId: l.product.id,
    measurementId: l.input.measurementId ?? null,
    description: l.input.description ?? null,
    width: l.input.width,
    height: l.input.height,
    thickness: l.input.thickness ?? l.product.defaultThickness ?? null,
    quantity: l.input.quantity,
    unitPrice: l.unitPrice,
    discount: l.input.discount,
    lineTotal: lineTotals[i]!,
    notes: l.input.notes ?? null,
    options: {
      create: l.chosen.map((c) => ({
        optionId: c.option.id, optionType: c.option.type, name: c.option.name, priceMethod: c.option.priceMethod, priceAdjustment: c.adj,
      })),
    },
  }));
}

export async function createQuotation(ctx: ServiceContext, input: unknown) {
  requirePermission(ctx, "quotations.create");
  const data = parse(quotationSchema, input);
  const { customer, showroomId, salespersonId } = await resolveHeader(ctx, data);
  const settings = await readSettings(ctx.db);
  return ctx.db.$transaction(async (tx) => {
    const lines = await buildLines(tx, ctx, data.items);
    const { totals, taxEnabled, taxRate, deposit } = totalsFor(data, lines, settings);
    const est = await estimateCosts(tx, lines);
    const date = data.quotationDate ?? new Date();
    const validUntil = data.validUntil ?? new Date(date.getTime() + settings["sales.quotationValidityDays"] * 86400_000);
    const number = await nextNumber(tx, "QUOTATION", date);
    const qt = await tx.quotation.create({
      data: {
        number, customerId: customer.id, showroomId, salespersonId, quotationDate: date, validUntil,
        currency: settings["finance.currency"], subtotal: totals.subtotal, discountType: data.discountType, discountValue: data.discountValue,
        discountTotal: totals.discountTotal, installationCharge: data.installationCharge, transportationCharge: data.transportationCharge,
        taxEnabled, taxRate, taxTotal: totals.taxTotal, total: totals.total, depositRequired: deposit,
        paymentTerms: data.paymentTerms, notes: data.notes, createdById: ctx.actor.userId, estimatedCost: est.total,
        items: { create: itemRows(lines, totals.lineTotals, est.unitCosts) },
      },
    });
    await audit(tx, ctx, { action: "quotation.create", entityType: "quotation", entityId: qt.id, entityNumber: number, newValues: { total: qt.total, customerId: customer.id, items: lines.length } });
    return qt;
  });
}

/** Prices a draft without saving (live preview in the quotation builder). */
export async function previewQuotation(ctx: ServiceContext, input: unknown) {
  requirePermission(ctx, "quotations.create");
  const data = parse(quotationSchema.extend({ customerId: uuid.optional() }), input);
  const settings = await readSettings(ctx.db);
  const lines = await buildLines(ctx.db as unknown as Tx, ctx, data.items);
  const { totals, taxEnabled, taxRate, deposit } = totalsFor(data as z.infer<typeof quotationSchema>, lines, settings);
  return {
    lines: lines.map((l, i) => ({ lineNo: l.lineNo, unitPrice: l.unitPrice, lineTotal: totals.lineTotals[i] })),
    subtotal: totals.subtotal, discountTotal: totals.discountTotal, taxTotal: totals.taxTotal, total: totals.total,
    taxEnabled, taxRate, depositRequired: deposit, currency: settings["finance.currency"],
  };
}

async function loadForChange(tx: Tx, ctx: ServiceContext, id: string) {
  // Row lock: concurrent approve/convert on the same quotation serialize here.
  await tx.$queryRaw`SELECT id FROM quotations WHERE id = ${id}::uuid FOR UPDATE`;
  const qt = await tx.quotation.findUnique({ where: { id } });
  if (!qt) throw notFound("quotation");
  assertInShowroomScope(ctx.actor, qt);
  return qt;
}

/** Only DRAFT quotations can be edited; lines are replaced. */
export async function updateQuotation(ctx: ServiceContext, id: string, input: unknown) {
  requirePermission(ctx, "quotations.edit");
  const data = parse(quotationSchema, input);
  const settings = await readSettings(ctx.db);
  const { customer, showroomId, salespersonId } = await resolveHeader(ctx, data);
  return ctx.db.$transaction(async (tx) => {
    const before = await loadForChange(tx, ctx, id);
    if (before.status !== "DRAFT") throw new AppError("IMMUTABLE", "errors.quotationNotDraft");
    const lines = await buildLines(tx, ctx, data.items);
    const { totals, taxEnabled, taxRate, deposit } = totalsFor(data, lines, settings);
    const est = await estimateCosts(tx, lines);
    await tx.quotationItem.deleteMany({ where: { quotationId: id } });
    const qt = await tx.quotation.update({
      where: { id },
      data: {
        customerId: customer.id, showroomId, salespersonId,
        ...(data.quotationDate ? { quotationDate: data.quotationDate } : {}),
        ...(data.validUntil ? { validUntil: data.validUntil } : {}),
        subtotal: totals.subtotal, discountType: data.discountType, discountValue: data.discountValue, discountTotal: totals.discountTotal,
        installationCharge: data.installationCharge, transportationCharge: data.transportationCharge, taxEnabled, taxRate,
        taxTotal: totals.taxTotal, total: totals.total, depositRequired: deposit, paymentTerms: data.paymentTerms, notes: data.notes,
        updatedById: ctx.actor.userId, estimatedCost: est.total,
        items: { create: itemRows(lines, totals.lineTotals, est.unitCosts) },
      },
    });
    await audit(tx, ctx, { action: "quotation.update", entityType: "quotation", entityId: id, entityNumber: before.number, oldValues: { total: before.total }, newValues: { total: qt.total } });
    return qt;
  });
}

type QStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED" | "EXPIRED" | "CONVERTED" | "CANCELLED";

async function transition(ctx: ServiceContext, id: string, to: QStatus, extra: Record<string, unknown> = {}, reason?: string) {
  return ctx.db.$transaction(async (tx) => {
    const qt = await loadForChange(tx, ctx, id);
    assertTransition("quotation", QUOTATION_TRANSITIONS, qt.status, to);
    if (to === "APPROVED" && qt.validUntil < new Date()) throw new AppError("CONFLICT", "errors.quotationExpired");
    const updated = await tx.quotation.update({ where: { id }, data: { status: to, updatedById: ctx.actor.userId, ...extra } });
    if (to === "SUBMITTED") {
      await notify(tx, { type: "quotation_pending", permission: "quotations.approve", params: { number: qt.number }, entityType: "quotation", entityId: id, showroomId: qt.showroomId, dedupeKey: `qt_pending:${id}:${Date.now()}`, excludeUserId: ctx.actor.userId });
    }
    await audit(tx, ctx, { action: `quotation.${to.toLowerCase()}`, entityType: "quotation", entityId: id, entityNumber: qt.number, oldValues: { status: qt.status }, newValues: { status: to, reason } });
    return updated;
  });
}

const reasonSchema = z.object({ reason: z.string().trim().max(1000).optional().nullable() });

export async function submitQuotation(ctx: ServiceContext, id: string) {
  requirePermission(ctx, "quotations.submit");
  return transition(ctx, id, "SUBMITTED", { submittedAt: new Date(), submittedById: ctx.actor.userId });
}
export async function returnToDraft(ctx: ServiceContext, id: string, input: unknown) {
  requirePermission(ctx, "quotations.approve");
  const { reason } = parse(reasonSchema, input);
  return transition(ctx, id, "DRAFT", {}, reason ?? undefined);
}
export async function approveQuotation(ctx: ServiceContext, id: string) {
  requirePermission(ctx, "quotations.approve");
  return transition(ctx, id, "APPROVED", { approvedAt: new Date(), approvedById: ctx.actor.userId });
}
export async function rejectQuotation(ctx: ServiceContext, id: string, input: unknown) {
  requirePermission(ctx, "quotations.approve");
  const { reason } = parse(z.object({ reason: z.string().trim().min(1).max(1000) }), input);
  return transition(ctx, id, "REJECTED", { rejectedAt: new Date(), rejectedById: ctx.actor.userId, rejectReason: reason }, reason);
}
export async function cancelQuotation(ctx: ServiceContext, id: string, input: unknown) {
  requirePermission(ctx, "quotations.cancel");
  const { reason } = parse(z.object({ reason: z.string().trim().min(1).max(1000) }), input);
  return transition(ctx, id, "CANCELLED", { cancelledAt: new Date(), cancelReason: reason }, reason);
}

/**
 * Creates a new DRAFT revision (number suffix -R{n}) copying lines and prices from any
 * non-draft quotation. The original stays unchanged — approved documents are never edited.
 */
export async function reviseQuotation(ctx: ServiceContext, id: string) {
  requirePermission(ctx, "quotations.create");
  return ctx.db.$transaction(async (tx) => {
    const src = await loadForChange(tx, ctx, id);
    if (src.status === "DRAFT" || src.status === "CONVERTED") throw new AppError("INVALID_TRANSITION", "errors.invalidTransition");
    const rootId = src.parentId ?? src.id;
    const root = src.parentId ? await tx.quotation.findUniqueOrThrow({ where: { id: rootId } }) : src;
    const count = await tx.quotation.count({ where: { parentId: rootId } });
    const items = await tx.quotationItem.findMany({ where: { quotationId: id }, include: { options: true }, orderBy: { lineNo: "asc" } });
    const settings = await readSettings(tx);
    const now = new Date();
    const qt = await tx.quotation.create({
      data: {
        number: `${root.number}-R${count + 1}`, revision: count + 1, parentId: rootId,
        customerId: src.customerId, showroomId: src.showroomId, salespersonId: src.salespersonId, quotationDate: now,
        validUntil: new Date(now.getTime() + settings["sales.quotationValidityDays"] * 86400_000), currency: src.currency,
        subtotal: src.subtotal, discountType: src.discountType, discountValue: src.discountValue, discountTotal: src.discountTotal,
        installationCharge: src.installationCharge, transportationCharge: src.transportationCharge, taxEnabled: src.taxEnabled,
        taxRate: src.taxRate, taxTotal: src.taxTotal, total: src.total, depositRequired: src.depositRequired,
        paymentTerms: src.paymentTerms, notes: src.notes, createdById: ctx.actor.userId,
        items: {
          create: items.map((i) => ({
            lineNo: i.lineNo, productId: i.productId, measurementId: i.measurementId, description: i.description, width: i.width, height: i.height,
            thickness: i.thickness, quantity: i.quantity, unitPrice: i.unitPrice, discount: i.discount, lineTotal: i.lineTotal, notes: i.notes,
            options: { create: i.options.map((o) => ({ optionId: o.optionId, optionType: o.optionType, name: o.name, priceMethod: o.priceMethod, priceAdjustment: o.priceAdjustment })) },
          })),
        },
      },
    });
    await audit(tx, ctx, { action: "quotation.revise", entityType: "quotation", entityId: qt.id, entityNumber: qt.number, newValues: { from: src.number } });
    return qt;
  });
}

/** Daily job: APPROVED quotations past validity become EXPIRED. Returns count. */
export async function expireQuotations(db: ServiceContext["db"]) {
  const res = await db.quotation.updateMany({ where: { status: "APPROVED", validUntil: { lt: new Date() } }, data: { status: "EXPIRED" } });
  return res.count;
}
