import { z } from "zod";
import type { Tx } from "@edge/db";
import { can, requirePermission, type ServiceContext } from "../context";
import { AppError, notFound } from "../errors";
import { audit } from "../platform/audit";
import { BASE_VARIABLES, evaluateFormula, evaluateRules, FormulaError, parseFormula, variablesOf } from "../platform/formula";
import { D, money, qty4, sum, type Dec } from "../platform/money";
import { optionalText, parse, requiredText, uuid } from "../validation";

const ruleKey = z.string().trim().regex(/^[a-z][a-z0-9_]{0,39}$/);

export const bomSchema = z.object({
  productId: uuid,
  name: requiredText(150),
  laborCostPerUnit: z.coerce.number().min(0).max(1e9).default(0),
  overheadPercent: z.coerce.number().min(0).max(500).default(0),
  notes: optionalText(2000),
  rules: z.array(z.object({ key: ruleKey, expression: z.string().trim().min(1).max(500), description: optionalText(300) })).max(50).default([]),
  items: z.array(z.object({
    materialId: uuid,
    quantityType: z.enum(["FIXED", "FORMULA"]),
    fixedQuantity: z.coerce.number().positive().nullable().optional(),
    formula: z.string().trim().max(500).nullable().optional(),
    perUnit: z.boolean().default(true),
    wastePercent: z.coerce.number().min(0).max(100).default(0),
    conditionOptionId: uuid.nullable().optional(),
    notes: optionalText(300),
  })).min(1).max(200),
});

type BomInput = z.infer<typeof bomSchema>;

/** Validates syntax and that every identifier is a base variable or an earlier rule. */
function validateFormulas(data: BomInput) {
  const known = new Set<string>(BASE_VARIABLES);
  const errors: { path: string; code: string; message: string }[] = [];
  data.rules.forEach((r, i) => {
    if (known.has(r.key)) errors.push({ path: `rules.${i}.key`, code: "duplicate", message: r.key });
    try {
      for (const v of variablesOf(parseFormula(r.expression))) if (!known.has(v)) errors.push({ path: `rules.${i}.expression`, code: "unknown_variable", message: v });
    } catch (e) {
      errors.push({ path: `rules.${i}.expression`, code: "syntax", message: (e as Error).message });
    }
    known.add(r.key);
  });
  data.items.forEach((it, i) => {
    if (it.quantityType === "FIXED") {
      if (!it.fixedQuantity) errors.push({ path: `items.${i}.fixedQuantity`, code: "required", message: "" });
      return;
    }
    if (!it.formula) return errors.push({ path: `items.${i}.formula`, code: "required", message: "" });
    try {
      for (const v of variablesOf(parseFormula(it.formula))) if (!known.has(v)) errors.push({ path: `items.${i}.formula`, code: "unknown_variable", message: v });
    } catch (e) {
      errors.push({ path: `items.${i}.formula`, code: "syntax", message: (e as Error).message });
    }
  });
  if (errors.length) throw new AppError("VALIDATION", "errors.formulaInvalid", errors);
}

const include = {
  product: { select: { id: true, code: true, name: true } },
  rules: { orderBy: { sortOrder: "asc" as const } },
  items: { orderBy: { lineNo: "asc" as const }, include: { material: { select: { id: true, code: true, name: true, averageCost: true, unit: { select: { name: true, code: true } }, category: { select: { costCategory: true } } } }, conditionOption: { select: { id: true, name: true } } } },
};

export async function listBoms(ctx: ServiceContext, input: unknown) {
  requirePermission(ctx, "bom.view");
  const q = parse(z.object({ productId: uuid.optional(), status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]).optional() }), input);
  return ctx.db.bomHeader.findMany({
    where: { ...(q.productId ? { productId: q.productId } : {}), ...(q.status ? { status: q.status } : {}) },
    include: { product: { select: { id: true, code: true, name: true } }, _count: { select: { items: true, mos: true } } },
    orderBy: [{ productId: "asc" }, { version: "desc" }],
    take: 500,
  });
}

export async function getBom(ctx: ServiceContext, id: string) {
  requirePermission(ctx, "bom.view");
  const b = await ctx.db.bomHeader.findUnique({ where: { id }, include });
  if (!b) throw notFound("bom");
  if (!can(ctx.actor, "costing.view")) return { ...b, laborCostPerUnit: null, items: b.items.map((i) => ({ ...i, material: { ...i.material, averageCost: null } })) };
  return b;
}

function rows(data: BomInput) {
  return {
    rules: { create: data.rules.map((r, i) => ({ key: r.key, expression: r.expression, description: r.description ?? null, sortOrder: i })) },
    items: {
      create: data.items.map((it, i) => ({
        lineNo: i + 1, materialId: it.materialId, quantityType: it.quantityType,
        fixedQuantity: it.quantityType === "FIXED" ? it.fixedQuantity : null, formula: it.quantityType === "FORMULA" ? it.formula : null,
        perUnit: it.perUnit, wastePercent: it.wastePercent, conditionOptionId: it.conditionOptionId ?? null, notes: it.notes ?? null,
      })),
    },
  };
}

/** Creates a new DRAFT version (version = max+1). */
export async function createBom(ctx: ServiceContext, input: unknown) {
  requirePermission(ctx, "bom.create");
  const data = parse(bomSchema, input);
  validateFormulas(data);
  return ctx.db.$transaction(async (tx) => {
    const product = await tx.product.findFirst({ where: { id: data.productId, deletedAt: null } });
    if (!product) throw notFound("product");
    const last = await tx.bomHeader.aggregate({ where: { productId: data.productId }, _max: { version: true } });
    const b = await tx.bomHeader.create({
      data: {
        productId: data.productId, version: (last._max.version ?? 0) + 1, name: data.name, laborCostPerUnit: data.laborCostPerUnit,
        overheadPercent: data.overheadPercent, notes: data.notes, createdById: ctx.actor.userId, ...rows(data),
      },
    });
    await audit(tx, ctx, { action: "bom.create", entityType: "bom", entityId: b.id, entityNumber: `${product.code} v${b.version}`, newValues: { items: data.items.length, rules: data.rules.length } });
    return b;
  });
}

/** Only DRAFT versions are editable; active/archived versions are frozen (MOs reference them). */
export async function updateBom(ctx: ServiceContext, id: string, input: unknown) {
  requirePermission(ctx, "bom.edit");
  const data = parse(bomSchema.omit({ productId: true }), input);
  validateFormulas({ ...data, productId: "" });
  return ctx.db.$transaction(async (tx) => {
    const b = await tx.bomHeader.findUnique({ where: { id } });
    if (!b) throw notFound("bom");
    if (b.status !== "DRAFT") throw new AppError("IMMUTABLE", "errors.bomNotDraft");
    await tx.bomItem.deleteMany({ where: { bomId: id } });
    await tx.bomRule.deleteMany({ where: { bomId: id } });
    const updated = await tx.bomHeader.update({
      where: { id },
      data: { name: data.name, laborCostPerUnit: data.laborCostPerUnit, overheadPercent: data.overheadPercent, notes: data.notes, updatedById: ctx.actor.userId, ...rows({ ...data, productId: b.productId }) },
    });
    await audit(tx, ctx, { action: "bom.update", entityType: "bom", entityId: id, newValues: { items: data.items.length } });
    return updated;
  });
}

/** Activates a draft; the previously active version of the product is archived. */
export async function activateBom(ctx: ServiceContext, id: string) {
  requirePermission(ctx, "bom.activate");
  return ctx.db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM bom_headers WHERE id = ${id}::uuid FOR UPDATE`;
    const b = await tx.bomHeader.findUnique({ where: { id } });
    if (!b) throw notFound("bom");
    if (b.status !== "DRAFT") throw new AppError("INVALID_TRANSITION", "errors.invalidTransition");
    await tx.bomHeader.updateMany({ where: { productId: b.productId, status: "ACTIVE" }, data: { status: "ARCHIVED" } });
    const a = await tx.bomHeader.update({ where: { id }, data: { status: "ACTIVE", activatedAt: new Date(), updatedById: ctx.actor.userId } });
    await audit(tx, ctx, { action: "bom.activate", entityType: "bom", entityId: id, newValues: { version: b.version } });
    return a;
  });
}

export async function archiveBom(ctx: ServiceContext, id: string) {
  requirePermission(ctx, "bom.activate");
  const b = await ctx.db.bomHeader.findUnique({ where: { id } });
  if (!b) throw notFound("bom");
  if (b.status === "ARCHIVED") throw new AppError("INVALID_TRANSITION", "errors.invalidTransition");
  return ctx.db.bomHeader.update({ where: { id }, data: { status: "ARCHIVED" } });
}

/** Copies any version into a new DRAFT version. */
export async function copyBom(ctx: ServiceContext, id: string) {
  requirePermission(ctx, "bom.create");
  const b = await ctx.db.bomHeader.findUnique({ where: { id }, include: { rules: { orderBy: { sortOrder: "asc" } }, items: { orderBy: { lineNo: "asc" } } } });
  if (!b) throw notFound("bom");
  return createBom(ctx, {
    productId: b.productId, name: b.name, laborCostPerUnit: Number(b.laborCostPerUnit), overheadPercent: Number(b.overheadPercent), notes: b.notes,
    rules: b.rules.map((r) => ({ key: r.key, expression: r.expression, description: r.description })),
    items: b.items.map((i) => ({
      materialId: i.materialId, quantityType: i.quantityType, fixedQuantity: i.fixedQuantity ? Number(i.fixedQuantity) : null, formula: i.formula,
      perUnit: i.perUnit, wastePercent: Number(i.wastePercent), conditionOptionId: i.conditionOptionId, notes: i.notes,
    })),
  });
}

// ─────────────────────────── Calculation ───────────────────────────

export interface Requirement {
  bomItemId: string;
  materialId: string;
  materialName: string;
  unit: string;
  costCategory: string;
  quantity: Dec;
  unitCost: Dec;
  cost: Dec;
}

export interface BomCalculation {
  requirements: Requirement[];
  materialCost: Dec;
  laborCost: Dec;
  overheadCost: Dec;
  totalCost: Dec;
}

/**
 * Explodes a BOM for given dimensions (mm), quantity and selected options.
 * quantity = (FIXED: fixedQuantity | FORMULA: f(W,H,T,Q,rules)) × (perUnit ? Q : 1) × (1 + waste%)
 * Lines for the same material are merged. Costs use the current moving average.
 */
export async function calculateBom(
  tx: Pick<Tx, "bomHeader">,
  bomId: string,
  input: { width: number; height: number; thickness?: number | null; quantity: number; optionIds?: string[] },
): Promise<BomCalculation> {
  const b = await tx.bomHeader.findUnique({ where: { id: bomId }, include });
  if (!b) throw notFound("bom");
  const base = { W: input.width, H: input.height, T: input.thickness ?? 0, Q: input.quantity };
  let vars: Record<string, number>;
  try {
    vars = evaluateRules(b.rules, base);
  } catch (e) {
    throw new AppError("VALIDATION", "errors.formulaInvalid", [{ path: "rules", code: "eval", message: (e as FormulaError).message }]);
  }
  const selected = new Set(input.optionIds ?? []);
  const merged = new Map<string, Requirement>();
  for (const it of b.items) {
    if (it.conditionOptionId && !selected.has(it.conditionOptionId)) continue;
    let perDoor: number;
    try {
      perDoor = it.quantityType === "FIXED" ? Number(it.fixedQuantity) : evaluateFormula(it.formula!, vars);
    } catch (e) {
      throw new AppError("VALIDATION", "errors.formulaInvalid", [{ path: `items.${it.lineNo}`, code: "eval", message: (e as Error).message }]);
    }
    if (perDoor < 0) throw new AppError("VALIDATION", "errors.formulaInvalid", [{ path: `items.${it.lineNo}`, code: "negative", message: "" }]);
    const qty = qty4(D(perDoor).times(it.perUnit ? input.quantity : 1).times(D(it.wastePercent).div(100).plus(1)));
    const unitCost = D(it.material.averageCost);
    const prev = merged.get(it.materialId);
    if (prev) {
      prev.quantity = qty4(prev.quantity.plus(qty));
      prev.cost = money(prev.quantity.times(unitCost));
    } else {
      merged.set(it.materialId, {
        bomItemId: it.id, materialId: it.materialId, materialName: it.material.name, unit: it.material.unit.name,
        costCategory: it.material.category.costCategory, quantity: qty, unitCost, cost: money(qty.times(unitCost)),
      });
    }
  }
  const requirements = [...merged.values()];
  const materialCost = money(sum(requirements.map((r) => r.cost)));
  const laborCost = money(D(b.laborCostPerUnit).times(input.quantity));
  const overheadCost = money(materialCost.plus(laborCost).times(D(b.overheadPercent)).div(100));
  return { requirements, materialCost, laborCost, overheadCost, totalCost: money(materialCost.plus(laborCost).plus(overheadCost)) };
}

/** Preview endpoint: calculate the active (or given) BOM for sample dimensions. */
export async function previewBom(ctx: ServiceContext, id: string, input: unknown) {
  requirePermission(ctx, "bom.view");
  const q = parse(z.object({ width: z.coerce.number().positive(), height: z.coerce.number().positive(), thickness: z.coerce.number().positive().optional(), quantity: z.coerce.number().positive().default(1), optionIds: z.array(uuid).default([]) }), input);
  const r = await calculateBom(ctx.db, id, q);
  if (!can(ctx.actor, "costing.view")) {
    return { requirements: r.requirements.map(({ unitCost: _u, cost: _c, ...x }) => x) };
  }
  return r;
}

export async function activeBomFor(tx: Pick<Tx, "bomHeader">, productId: string) {
  return tx.bomHeader.findFirst({ where: { productId, status: "ACTIVE" }, select: { id: true } });
}
