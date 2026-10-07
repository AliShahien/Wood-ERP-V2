import { describe, expect, it } from "vitest";
import * as purchasing from "../src/modules/purchasing";
import * as materials from "../src/modules/materials";
import * as suppliers from "../src/modules/suppliers";
import { adminCtx, uniq } from "./helpers";

describe("purchasing cycle", () => {
  it("PO → partial & full receipts (stock + average cost) → supplier invoice → payment → payable 0", async () => {
    const ctx = await adminCtx();
    const cat = await ctx.db.materialCategory.findFirstOrThrow({ where: { code: "WOOD" } });
    const unit = await ctx.db.unit.findUniqueOrThrow({ where: { code: "M3" } });
    const mat = await materials.createMaterial(ctx, { name: `خشب زان ${uniq()}`, categoryId: cat.id, unitId: unit.id });
    const sup = await suppliers.createSupplier(ctx, { name: `مورد ${uniq()}` });
    const wh = await ctx.db.warehouse.findUniqueOrThrow({ where: { code: "WH-RAW" } });
    const cash = await ctx.db.cashAccount.findUniqueOrThrow({ where: { code: "BANK-01" } });

    const po = await purchasing.createPurchaseOrder(ctx, { supplierId: sup.id, warehouseId: wh.id, taxEnabled: true, taxRate: 14, items: [{ materialId: mat.id, quantity: 10, unitPrice: 12000, discount: 1000 }] });
    expect(po.number).toMatch(/^PO-\d{4}-\d{6}$/);
    expect(po.total.toString()).toBe("135660"); // (120000 − 1000) × 1.14
    await expect(purchasing.createGoodsReceipt(ctx, { purchaseOrderId: po.id })).rejects.toMatchObject({ messageKey: "errors.poNotApproved" });
    await purchasing.transitionPurchaseOrder(ctx, po.id, "SUBMITTED");
    await purchasing.transitionPurchaseOrder(ctx, po.id, "APPROVED");

    const poFull = await purchasing.getPurchaseOrder(ctx, po.id);
    const gr1 = await purchasing.createGoodsReceipt(ctx, { purchaseOrderId: po.id, items: [{ purchaseOrderItemId: poFull.items[0]!.id, quantity: 4 }] });
    await purchasing.postGoodsReceipt(ctx, gr1.id);
    let bal = await ctx.db.inventoryBalance.findUniqueOrThrow({ where: { materialId_warehouseId: { materialId: mat.id, warehouseId: wh.id } } });
    expect(Number(bal.quantity)).toBe(4);
    expect((await ctx.db.purchaseOrder.findUniqueOrThrow({ where: { id: po.id } })).status).toBe("PARTIALLY_RECEIVED");
    const m1 = await ctx.db.material.findUniqueOrThrow({ where: { id: mat.id } });
    expect(Number(m1.averageCost)).toBe(11900); // net of line discount, tax excluded
    expect(Number(m1.lastPurchaseCost)).toBe(11900);

    const over = await purchasing.createGoodsReceipt(ctx, { purchaseOrderId: po.id, items: [{ purchaseOrderItemId: poFull.items[0]!.id, quantity: 7 }] });
    await expect(purchasing.postGoodsReceipt(ctx, over.id)).rejects.toMatchObject({ messageKey: "errors.overReceipt" });

    const gr2 = await purchasing.createGoodsReceipt(ctx, { purchaseOrderId: po.id });
    await purchasing.postGoodsReceipt(ctx, gr2.id);
    bal = await ctx.db.inventoryBalance.findUniqueOrThrow({ where: { materialId_warehouseId: { materialId: mat.id, warehouseId: wh.id } } });
    expect(Number(bal.quantity)).toBe(10);
    expect((await ctx.db.purchaseOrder.findUniqueOrThrow({ where: { id: po.id } })).status).toBe("RECEIVED");

    const draft = await purchasing.invoiceDraftFromPo(ctx, po.id);
    const si = await purchasing.createSupplierInvoice(ctx, { ...draft, supplierInvoiceNo: `F-${uniq()}` });
    expect(si.total.toString()).toBe("135660");
    await purchasing.postSupplierInvoice(ctx, si.id);
    expect(await suppliers.supplierBalance(ctx, sup.id)).toBe(135660);
    await expect(purchasing.createSupplierPayment(ctx, { supplierId: sup.id, supplierInvoiceId: si.id, cashAccountId: cash.id, amount: 200000, method: "BANK_TRANSFER" })).rejects.toMatchObject({ messageKey: "errors.overpayment" });
    await purchasing.createSupplierPayment(ctx, { supplierId: sup.id, supplierInvoiceId: si.id, cashAccountId: cash.id, amount: 100000, method: "BANK_TRANSFER" });
    const p2 = await purchasing.createSupplierPayment(ctx, { supplierId: sup.id, supplierInvoiceId: si.id, cashAccountId: cash.id, amount: 35660, method: "CASH" });
    expect((await ctx.db.supplierInvoice.findUniqueOrThrow({ where: { id: si.id } })).status).toBe("PAID");
    expect(await suppliers.supplierBalance(ctx, sup.id)).toBe(0);
    await purchasing.reverseSupplierPayment(ctx, p2.id, { reason: "wrong account" });
    expect(await suppliers.supplierBalance(ctx, sup.id)).toBe(35660);
    expect((await ctx.db.supplierInvoice.findUniqueOrThrow({ where: { id: si.id } })).status).toBe("PARTIALLY_PAID");
    await expect(purchasing.createSupplierInvoice(ctx, { ...draft, supplierInvoiceNo: si.supplierInvoiceNo })).rejects.toMatchObject({ messageKey: "errors.duplicateSupplierInvoice" });
  });

  it("a receipt cannot be reversed after its stock was consumed", async () => {
    const ctx = await adminCtx();
    const cat = await ctx.db.materialCategory.findFirstOrThrow();
    const unit = await ctx.db.unit.findUniqueOrThrow({ where: { code: "PCS" } });
    const mat = await materials.createMaterial(ctx, { name: `كالون ${uniq()}`, categoryId: cat.id, unitId: unit.id });
    const sup = await suppliers.createSupplier(ctx, { name: `مورد ${uniq()}` });
    const wh = await ctx.db.warehouse.findUniqueOrThrow({ where: { code: "WH-ACC" } });
    const gr = await purchasing.createGoodsReceipt(ctx, { supplierId: sup.id, warehouseId: wh.id, items: [{ materialId: mat.id, quantity: 5, unitCost: 100 }] });
    await purchasing.postGoodsReceipt(ctx, gr.id);
    const adj = await ctx.db.$transaction((tx) =>
      import("../src/platform/inventory").then(({ postStock }) => postStock(tx, ctx, { type: "test", id: mat.id, number: "T", date: new Date() }, [{ materialId: mat.id, warehouseId: wh.id, quantity: -3, type: "MATERIAL_ISSUE" }])),
    );
    expect(adj).toHaveLength(1);
    await expect(purchasing.reverseGoodsReceipt(ctx, gr.id, { reason: "damaged" })).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK" });
  });
});
