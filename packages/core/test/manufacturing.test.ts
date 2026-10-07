import { describe, expect, it } from "vitest";
import { evaluateFormula, evaluateRules, FormulaError, parseFormula } from "../src/platform/formula";
import { postStock } from "../src/platform/inventory";
import * as bom from "../src/modules/bom";
import * as inventory from "../src/modules/inventory";
import * as manufacturing from "../src/modules/manufacturing";
import * as measurements from "../src/modules/measurements";
import * as materials from "../src/modules/materials";
import * as products from "../src/modules/products";
import * as quotations from "../src/modules/quotations";
import * as salesOrders from "../src/modules/sales-orders";
import * as customers from "../src/modules/customers";
import type { ServiceContext } from "../src/context";
import { adminCtx, uniq } from "./helpers";

describe("formula engine", () => {
  it("evaluates arithmetic, precedence, functions and variables", () => {
    expect(evaluateFormula("W * H / 1000000", { W: 900, H: 2100 })).toBeCloseTo(1.89);
    expect(evaluateFormula("2 + 3 * 4 ^ 2", {})).toBe(50);
    expect(evaluateFormula("-(2+3)*2", {})).toBe(-10);
    expect(evaluateFormula("ceil(W/600) + max(1, 2, 3) + round(1.2345, 2)", { W: 1300 })).toBeCloseTo(3 + 3 + 1.23);
    expect(evaluateRules([{ key: "area", expression: "W*H/1e6" }, { key: "perimeter", expression: "2*(W+H)/1000" }], { W: 1000, H: 2000 })).toMatchObject({ area: 2, perimeter: 6 });
  });

  it("rejects code injection and bad input", () => {
    expect(() => parseFormula("process.exit(1)")).toThrow(FormulaError);
    expect(() => parseFormula("constructor.constructor('x')()")).toThrow(FormulaError);
    expect(() => evaluateFormula("W / 0", { W: 1 })).toThrow(/division by zero/);
    expect(() => evaluateFormula("X + 1", { W: 1 })).toThrow(/unknown variable/);
    expect(() => parseFormula("W +")).toThrow(FormulaError);
    expect(() => parseFormula("eval(1)")).toThrow(/unknown function/);
  });
});

async function setup(ctx: ServiceContext) {
  const cat = await ctx.db.materialCategory.findFirstOrThrow({ where: { code: "BOARD" } });
  const pcs = await ctx.db.unit.findUniqueOrThrow({ where: { code: "PCS" } });
  const m2 = await ctx.db.unit.findUniqueOrThrow({ where: { code: "M2" } });
  const mdf = await materials.createMaterial(ctx, { name: `MDF 18 مم ${uniq()}`, categoryId: cat.id, unitId: m2.id });
  const hinge = await materials.createMaterial(ctx, { name: `مفصلات ${uniq()}`, categoryId: cat.id, unitId: pcs.id });
  const wh = await ctx.db.warehouse.findUniqueOrThrow({ where: { code: "WH-RAW" } });
  // Opening stock: MDF 100 m² @ 200, hinges 50 @ 30
  const adj = await inventory.createAdjustment(ctx, {
    warehouseId: wh.id, isOpening: true, reason: "opening",
    items: [{ materialId: mdf.id, quantityChange: 100, unitCost: 200 }, { materialId: hinge.id, quantityChange: 50, unitCost: 30 }],
  });
  await inventory.postAdjustment(ctx, adj.id);
  const pcat = await ctx.db.productCategory.findFirstOrThrow();
  const product = await products.createProduct(ctx, { name: `BOM Door ${uniq()}`, categoryId: pcat.id, status: "ACTIVE", basePrice: 8000 });
  const glass = await products.createOption(ctx, { code: `GL${uniq().toUpperCase()}`, type: "ACCESSORY", name: "Extra hinge set", priceAdjustment: 200 });
  await products.setProductOptions(ctx, product.id, { options: [{ optionId: glass.id }] });
  const b = await bom.createBom(ctx, {
    productId: product.id, name: "Standard", laborCostPerUnit: 300, overheadPercent: 10,
    rules: [{ key: "area", expression: "W * H / 1000000" }],
    items: [
      { materialId: mdf.id, quantityType: "FORMULA", formula: "area * 2", wastePercent: 10 },
      { materialId: hinge.id, quantityType: "FIXED", fixedQuantity: 3 },
      { materialId: hinge.id, quantityType: "FIXED", fixedQuantity: 1, conditionOptionId: glass.id },
    ],
  });
  await bom.activateBom(ctx, b.id);
  const showroom = await ctx.db.showroom.findFirstOrThrow({ where: { code: "SR-01" } });
  const customer = await customers.createCustomer(ctx, { name: "عميل التصنيع", showroomId: showroom.id });
  return { mdf, hinge, wh, product, glass, bomId: b.id, customer };
}

describe("inventory engine", () => {
  it("stock 10: concurrent requests of 8 and 5 — exactly one succeeds, stock never negative", async () => {
    const ctx = await adminCtx();
    const cat = await ctx.db.materialCategory.findFirstOrThrow();
    const unit = await ctx.db.unit.findUniqueOrThrow({ where: { code: "PCS" } });
    const m = await materials.createMaterial(ctx, { name: `كالون ${uniq()}`, categoryId: cat.id, unitId: unit.id });
    const wh = await ctx.db.warehouse.findFirstOrThrow();
    await ctx.db.$transaction((tx) => postStock(tx, ctx, { type: "test", id: m.id, number: "T-1", date: new Date() }, [{ materialId: m.id, warehouseId: wh.id, quantity: 10, unitCost: 5, type: "OPENING_BALANCE" }]));
    const take = (q: number) => ctx.db.$transaction((tx) => postStock(tx, ctx, { type: "test", id: m.id, number: `T-${q}`, date: new Date() }, [{ materialId: m.id, warehouseId: wh.id, quantity: -q, type: "MATERIAL_ISSUE" }]));
    const results = await Promise.allSettled([take(8), take(5)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ code: "INSUFFICIENT_STOCK" });
    const bal = await ctx.db.inventoryBalance.findUniqueOrThrow({ where: { materialId_warehouseId: { materialId: m.id, warehouseId: wh.id } } });
    expect([2, 5]).toContain(Number(bal.quantity));
    const ledger = await ctx.db.inventoryTransaction.aggregate({ where: { materialId: m.id }, _sum: { quantity: true } });
    expect(Number(ledger._sum.quantity)).toBe(Number(bal.quantity)); // ledger == balance
  });

  it("maintains the moving average cost and transfers keep value", async () => {
    const ctx = await adminCtx();
    const cat = await ctx.db.materialCategory.findFirstOrThrow();
    const unit = await ctx.db.unit.findUniqueOrThrow({ where: { code: "L" } });
    const m = await materials.createMaterial(ctx, { name: `دهان ${uniq()}`, categoryId: cat.id, unitId: unit.id });
    const [w1, w2] = await ctx.db.warehouse.findMany({ take: 2, orderBy: { code: "asc" } });
    const a1 = await inventory.createAdjustment(ctx, { warehouseId: w1!.id, reason: "in", items: [{ materialId: m.id, quantityChange: 10, unitCost: 100 }] });
    await inventory.postAdjustment(ctx, a1.id);
    const a2 = await inventory.createAdjustment(ctx, { warehouseId: w1!.id, reason: "in", items: [{ materialId: m.id, quantityChange: 10, unitCost: 200 }] });
    await inventory.postAdjustment(ctx, a2.id);
    expect(Number((await ctx.db.material.findUniqueOrThrow({ where: { id: m.id } })).averageCost)).toBe(150);
    const tr = await inventory.createTransfer(ctx, { fromWarehouseId: w1!.id, toWarehouseId: w2!.id, items: [{ materialId: m.id, quantity: 5 }] });
    await inventory.postTransfer(ctx, tr.id);
    expect(Number((await ctx.db.material.findUniqueOrThrow({ where: { id: m.id } })).averageCost)).toBe(150);
    const b2 = await ctx.db.inventoryBalance.findUniqueOrThrow({ where: { materialId_warehouseId: { materialId: m.id, warehouseId: w2!.id } } });
    expect(Number(b2.quantity)).toBe(5);
    const big = await inventory.createTransfer(ctx, { fromWarehouseId: w2!.id, toWarehouseId: w1!.id, items: [{ materialId: m.id, quantity: 6 }] });
    await expect(inventory.postTransfer(ctx, big.id)).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK" });
  });
});

describe("BOM", () => {
  it("rejects invalid formulas at save time", async () => {
    const ctx = await adminCtx();
    const f = await setup(ctx);
    await expect(bom.createBom(ctx, { productId: f.product.id, name: "Bad", items: [{ materialId: f.mdf.id, quantityType: "FORMULA", formula: "W * unknownVar" }] })).rejects.toMatchObject({ messageKey: "errors.formulaInvalid" });
    await expect(bom.createBom(ctx, { productId: f.product.id, name: "Bad", items: [{ materialId: f.mdf.id, quantityType: "FORMULA", formula: "W *" }] })).rejects.toMatchObject({ messageKey: "errors.formulaInvalid" });
  });

  it("calculates dimension-based requirements with waste, conditions and costs", async () => {
    const ctx = await adminCtx();
    const f = await setup(ctx);
    // 1000×2000 → area 2 → MDF 2×2 = 4 per door × Q2 = 8 × 1.10 = 8.8 m²
    const calc = await bom.calculateBom(ctx.db, f.bomId, { width: 1000, height: 2000, quantity: 2, optionIds: [] });
    const mdf = calc.requirements.find((r) => r.materialId === f.mdf.id)!;
    const hinge = calc.requirements.find((r) => r.materialId === f.hinge.id)!;
    expect(mdf.quantity.toString()).toBe("8.8");
    expect(hinge.quantity.toString()).toBe("6");
    expect(mdf.cost.toString()).toBe("1760"); // 8.8 × 200
    const withOpt = await bom.calculateBom(ctx.db, f.bomId, { width: 1000, height: 2000, quantity: 2, optionIds: [f.glass.id] });
    expect(withOpt.requirements.find((r) => r.materialId === f.hinge.id)!.quantity.toString()).toBe("8");
    // material 1760 + 180, labor 600, overhead 10% of 2540
    expect(calc.materialCost.toString()).toBe("1940");
    expect(calc.laborCost.toString()).toBe("600");
    expect(calc.overheadCost.toString()).toBe("254");
    expect(calc.totalCost.toString()).toBe("2794");
  });

  it("active BOMs are frozen; one active version per product", async () => {
    const ctx = await adminCtx();
    const f = await setup(ctx);
    await expect(bom.updateBom(ctx, f.bomId, { name: "x", items: [{ materialId: f.mdf.id, quantityType: "FIXED", fixedQuantity: 1 }] })).rejects.toMatchObject({ code: "IMMUTABLE" });
    const v2 = await bom.copyBom(ctx, f.bomId);
    expect(v2.version).toBe(2);
    await bom.activateBom(ctx, v2.id);
    expect((await ctx.db.bomHeader.findUniqueOrThrow({ where: { id: f.bomId } })).status).toBe("ARCHIVED");
    expect(await ctx.db.bomHeader.count({ where: { productId: f.product.id, status: "ACTIVE" } })).toBe(1);
  });
});

describe("measurements", () => {
  it("approved versions are immutable; changes create a new version", async () => {
    const ctx = await adminCtx();
    const f = await setup(ctx);
    const m = await measurements.createMeasurement(ctx, { customerId: f.customer.id, productId: f.product.id, room: "غرفة النوم", width: 900, height: 2100 });
    expect(m.number).toMatch(/^MEA-\d{4}-\d{6}$/);
    await measurements.reviseMeasurement(ctx, m.id, { width: 910, height: 2100 }); // draft: in place
    await measurements.approveMeasurement(ctx, m.id);
    await expect(measurements.reviseMeasurement(ctx, m.id, { width: 920, height: 2100 })).rejects.toMatchObject({ messageKey: "errors.changeReasonRequired" });
    await measurements.reviseMeasurement(ctx, m.id, { width: 920, height: 2100, changeReason: "site re-check" });
    const full = await measurements.getMeasurement(ctx, m.id);
    expect(full.versions.map((v) => [v.version, Number(v.width)])).toEqual([[2, 920], [1, 910]]);
    expect(full.status).toBe("DRAFT");
    await expect(ctx.db.measurementVersion.update({ where: { id: full.versions[1]!.id }, data: { width: 1 } })).rejects.toThrow(/EDGE_IMMUTABLE/);
  });
});

describe("manufacturing order lifecycle", () => {
  it("SO → MO → BOM requirements → issue (stock deducted) → production → QC fail/rework → pass → completed with costs", async () => {
    const ctx = await adminCtx();
    const f = await setup(ctx);
    const qt = await quotations.createQuotation(ctx, { customerId: f.customer.id, items: [{ productId: f.product.id, width: 1000, height: 2000, quantity: 2 }] });
    await quotations.submitQuotation(ctx, qt.id);
    await quotations.approveQuotation(ctx, qt.id);
    const so = await salesOrders.convertQuotation(ctx, qt.id, {});
    const { items: [mo] } = await manufacturing.createFromSalesOrder(ctx, so.id);
    expect(mo!.number).toMatch(/^MO-\d{4}-\d{6}$/);
    await expect(manufacturing.createFromSalesOrder(ctx, so.id)).rejects.toMatchObject({ messageKey: "errors.nothingToManufacture" });
    await expect(manufacturing.startProduction(ctx, mo!.id)).rejects.toMatchObject({ code: "INVALID_TRANSITION" });

    const approved = await manufacturing.approveManufacturingOrder(ctx, mo!.id);
    expect(approved.status).toBe("APPROVED");
    expect(approved.estimatedMaterialCost.toString()).toBe("1940");
    expect((await ctx.db.salesOrder.findUniqueOrThrow({ where: { id: so.id } })).status).toBe("IN_PRODUCTION");

    const mdfBefore = await ctx.db.inventoryBalance.findUniqueOrThrow({ where: { materialId_warehouseId: { materialId: f.mdf.id, warehouseId: f.wh.id } } });
    const mi = await manufacturing.createMaterialIssue(ctx, mo!.id, { warehouseId: f.wh.id });
    expect(mi.number).toMatch(/^MI-\d{4}-\d{6}$/);
    await manufacturing.postMaterialIssue(ctx, mi.id);
    await expect(manufacturing.postMaterialIssue(ctx, mi.id)).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
    const mdfAfter = await ctx.db.inventoryBalance.findUniqueOrThrow({ where: { materialId_warehouseId: { materialId: f.mdf.id, warehouseId: f.wh.id } } });
    expect(Number(mdfBefore.quantity) - Number(mdfAfter.quantity)).toBeCloseTo(8.8);
    let cur = await ctx.db.manufacturingOrder.findUniqueOrThrow({ where: { id: mo!.id } });
    expect(cur.status).toBe("MATERIALS_ISSUED");
    expect(cur.actualMaterialCost.toString()).toBe("1940");

    // Extra MDF issued (actual 9.5 vs 8.8), then 0.2 returned.
    const extra = await manufacturing.createMaterialIssue(ctx, mo!.id, { warehouseId: f.wh.id, lines: [{ materialId: f.mdf.id, quantity: 0.9 }] });
    await manufacturing.postMaterialIssue(ctx, extra.id);
    const ret = await manufacturing.createMaterialIssue(ctx, mo!.id, { type: "RETURN", warehouseId: f.wh.id, lines: [{ materialId: f.mdf.id, quantity: 0.2 }] });
    await manufacturing.postMaterialIssue(ctx, ret.id);
    await expect(manufacturing.createMaterialIssue(ctx, mo!.id, { type: "RETURN", warehouseId: f.wh.id, lines: [{ materialId: f.mdf.id, quantity: 999 }] })).rejects.toMatchObject({ messageKey: "errors.returnExceedsIssued" });

    await ctx.db.productionStage.updateMany({ data: { laborRatePerHour: 50 } });
    await manufacturing.startProduction(ctx, mo!.id);
    const ops = await ctx.db.productionOperation.findMany({ where: { manufacturingOrderId: mo!.id }, orderBy: { sequence: "asc" } });
    expect(ops.length).toBeGreaterThan(0);
    for (const op of ops) {
      await manufacturing.updateOperation(ctx, op.id, { action: "start" });
      await manufacturing.updateOperation(ctx, op.id, { action: "complete", laborHours: 1 });
    }
    expect((await ctx.db.manufacturingOrder.findUniqueOrThrow({ where: { id: mo!.id } })).status).toBe("QUALITY_CHECK");

    await manufacturing.recordQualityCheck(ctx, mo!.id, { result: "FAILED", defects: "scratch on panel" });
    cur = await ctx.db.manufacturingOrder.findUniqueOrThrow({ where: { id: mo!.id } });
    expect(cur.status).toBe("IN_PRODUCTION");
    const rework = await ctx.db.productionOperation.findMany({ where: { manufacturingOrderId: mo!.id, status: "PENDING" } });
    expect(rework.length).toBe(ops.length);
    for (const op of rework) await manufacturing.updateOperation(ctx, op.id, { action: "skip" });
    await manufacturing.recordQualityCheck(ctx, mo!.id, { result: "PASSED", checklist: [{ item: "الأبعاد", ok: true }] });

    cur = await ctx.db.manufacturingOrder.findUniqueOrThrow({ where: { id: mo!.id } });
    expect(cur.status).toBe("COMPLETED");
    const v = await manufacturing.costVariance(ctx, mo!.id);
    const mdfLine = v.lines.find((l) => l.materialId === f.mdf.id)!;
    expect(mdfLine.estimatedQty.toString()).toBe("8.8");
    expect(mdfLine.actualQty.toString()).toBe("9.5");
    expect(mdfLine.qtyVariance.toString()).toBe("0.7");
    expect(Number(v.actual.labor)).toBe(ops.length * 50); // 1 h × 50/h per completed stage; rework skipped
    // overhead 10% of (actual material + labor)
    expect(Number(v.actual.overhead)).toBeCloseTo((Number(v.actual.material) + Number(v.actual.labor)) * 0.1, 2);
    const soAfter = await ctx.db.salesOrder.findUniqueOrThrow({ where: { id: so.id }, include: { items: true } });
    expect(soAfter.status).toBe("READY");
    expect(Number(soAfter.items[0]!.manufacturedQuantity)).toBe(2);
  });

  it("goes to WAITING_MATERIALS when stock is short and blocks cancellation while materials are issued", async () => {
    const ctx = await adminCtx();
    const f = await setup(ctx);
    const qt = await quotations.createQuotation(ctx, { customerId: f.customer.id, items: [{ productId: f.product.id, width: 1000, height: 2000, quantity: 20 }] });
    await quotations.submitQuotation(ctx, qt.id);
    await quotations.approveQuotation(ctx, qt.id);
    const so = await salesOrders.convertQuotation(ctx, qt.id, {});
    const { items: [mo] } = await manufacturing.createFromSalesOrder(ctx, so.id);
    const a = await manufacturing.approveManufacturingOrder(ctx, mo!.id);
    expect(a.status).toBe("WAITING_MATERIALS"); // needs 88 m² MDF, hinges 60 > 50
    const mi = await manufacturing.createMaterialIssue(ctx, mo!.id, { warehouseId: f.wh.id });
    await expect(manufacturing.postMaterialIssue(ctx, mi.id)).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK" });
    const partial = await manufacturing.createMaterialIssue(ctx, mo!.id, { warehouseId: f.wh.id, lines: [{ materialId: f.hinge.id, quantity: 10 }] });
    await manufacturing.postMaterialIssue(ctx, partial.id);
    await expect(manufacturing.cancelManufacturingOrder(ctx, mo!.id, { reason: "x" })).rejects.toMatchObject({ messageKey: "errors.returnMaterialsFirst" });
    await manufacturing.reverseMaterialIssue(ctx, partial.id, { reason: "wrong" });
    await manufacturing.cancelManufacturingOrder(ctx, mo!.id, { reason: "customer changed mind" });
    expect((await ctx.db.manufacturingOrder.findUniqueOrThrow({ where: { id: mo!.id } })).status).toBe("CANCELLED");
  });
});
