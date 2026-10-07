import { describe, expect, it } from "vitest";
import * as bom from "../src/modules/bom";
import * as customers from "../src/modules/customers";
import * as deliveries from "../src/modules/deliveries";
import * as manufacturing from "../src/modules/manufacturing";
import * as materials from "../src/modules/materials";
import * as measurements from "../src/modules/measurements";
import * as products from "../src/modules/products";
import * as purchasing from "../src/modules/purchasing";
import * as quotations from "../src/modules/quotations";
import * as receivables from "../src/modules/receivables";
import * as salesOrders from "../src/modules/sales-orders";
import * as suppliers from "../src/modules/suppliers";
import { adminCtx, uniq } from "./helpers";

/**
 * Critical business scenario (spec §72): the whole chain must work end-to-end on one database
 * with consistent stock, costs and balances.
 */
describe("critical scenario", () => {
  it("customer → product → quotation → approval → SO → MO → material issue → production → QC → delivery → invoice → payment", async () => {
    const ctx = await adminCtx();
    const u = uniq();

    // Purchasing feeds the stock the order needs.
    const cat = await ctx.db.materialCategory.findUniqueOrThrow({ where: { code: "BOARD" } });
    const m2 = await ctx.db.unit.findUniqueOrThrow({ where: { code: "M2" } });
    const mdf = await materials.createMaterial(ctx, { name: `MDF 18 مم ${u}`, categoryId: cat.id, unitId: m2.id });
    const sup = await suppliers.createSupplier(ctx, { name: `مورد ${u}` });
    const wh = await ctx.db.warehouse.findUniqueOrThrow({ where: { code: "WH-RAW" } });
    const po = await purchasing.createPurchaseOrder(ctx, { supplierId: sup.id, warehouseId: wh.id, taxEnabled: false, items: [{ materialId: mdf.id, quantity: 50, unitPrice: 200 }] });
    await purchasing.transitionPurchaseOrder(ctx, po.id, "SUBMITTED");
    await purchasing.transitionPurchaseOrder(ctx, po.id, "APPROVED");
    const gr = await purchasing.createGoodsReceipt(ctx, { purchaseOrderId: po.id });
    await purchasing.postGoodsReceipt(ctx, gr.id);
    const si = await purchasing.createSupplierInvoice(ctx, { ...(await purchasing.invoiceDraftFromPo(ctx, po.id)), supplierInvoiceNo: `X${u}` });
    await purchasing.postSupplierInvoice(ctx, si.id);
    const bank = await ctx.db.cashAccount.findUniqueOrThrow({ where: { code: "BANK-01" } });
    await purchasing.createSupplierPayment(ctx, { supplierId: sup.id, supplierInvoiceId: si.id, cashAccountId: bank.id, amount: 10000, method: "BANK_TRANSFER" });
    expect(await suppliers.supplierBalance(ctx, sup.id)).toBe(0);

    // Product + active BOM.
    const pcat = await ctx.db.productCategory.findFirstOrThrow();
    const product = await products.createProduct(ctx, { name: `Modern Classic ${u}`, categoryId: pcat.id, status: "ACTIVE", basePrice: 9000 });
    const b = await bom.createBom(ctx, { productId: product.id, name: "Std", laborCostPerUnit: 200, overheadPercent: 10, rules: [{ key: "area", expression: "W*H/1000000" }], items: [{ materialId: mdf.id, quantityType: "FORMULA", formula: "area * 2" }] });
    await bom.activateBom(ctx, b.id);

    // Customer, measurement, quotation.
    const showroom = await ctx.db.showroom.findUniqueOrThrow({ where: { code: "SR-01" } });
    const customer = await customers.createCustomer(ctx, { name: `عميل ${u}`, phone: "01000000001", showroomId: showroom.id });
    const meas = await measurements.createMeasurement(ctx, { customerId: customer.id, productId: product.id, width: 1000, height: 2000 });
    await measurements.approveMeasurement(ctx, meas.id);
    const qt = await quotations.createQuotation(ctx, { customerId: customer.id, taxEnabled: true, taxRate: 14, items: [{ productId: product.id, width: 1000, height: 2000, quantity: 2, measurementId: meas.id }] });
    expect(Number(qt.total)).toBe(20520); // 9000 × 2 × 1.14
    expect(Number(qt.estimatedCost)).toBeGreaterThan(0);
    await quotations.submitQuotation(ctx, qt.id);
    await quotations.approveQuotation(ctx, qt.id);
    const so = await salesOrders.convertQuotation(ctx, qt.id, {});

    // Deposit.
    const cash = await ctx.db.cashAccount.findUniqueOrThrow({ where: { code: "CASH-01" } });
    await receivables.createPayment(ctx, { customerId: customer.id, salesOrderId: so.id, cashAccountId: cash.id, amount: 10000, method: "CASH" });

    // Manufacturing.
    const { id: moId } = await manufacturing.createFromSalesOrder(ctx, so.id);
    const approved = await manufacturing.approveManufacturingOrder(ctx, moId);
    expect(approved.status).toBe("APPROVED");
    const stockBefore = Number((await ctx.db.inventoryBalance.findUniqueOrThrow({ where: { materialId_warehouseId: { materialId: mdf.id, warehouseId: wh.id } } })).quantity);
    const mi = await manufacturing.createMaterialIssue(ctx, moId, { warehouseId: wh.id });
    await manufacturing.postMaterialIssue(ctx, mi.id);
    const stockAfter = Number((await ctx.db.inventoryBalance.findUniqueOrThrow({ where: { materialId_warehouseId: { materialId: mdf.id, warehouseId: wh.id } } })).quantity);
    expect(stockBefore - stockAfter).toBe(8); // 2 m² × 2 × 2 doors
    await manufacturing.startProduction(ctx, moId);
    for (const op of await ctx.db.productionOperation.findMany({ where: { manufacturingOrderId: moId } })) await manufacturing.updateOperation(ctx, op.id, { action: "complete", laborHours: 1 });
    await manufacturing.recordQualityCheck(ctx, moId, { result: "PASSED" });
    expect((await ctx.db.manufacturingOrder.findUniqueOrThrow({ where: { id: moId } })).status).toBe("COMPLETED");
    expect((await ctx.db.salesOrder.findUniqueOrThrow({ where: { id: so.id } })).status).toBe("READY");

    // Delivery (partial then rest).
    const d1 = await deliveries.createDelivery(ctx, so.id, { installationRequired: true, scheduledDate: new Date() });
    const d1Full = await deliveries.getDelivery(ctx, d1.id);
    await deliveries.completeDelivery(ctx, d1.id, { receivedByName: "العميل", lines: [{ deliveryItemId: d1Full.items[0]!.id, deliveredQuantity: 1 }] });
    expect((await ctx.db.salesOrder.findUniqueOrThrow({ where: { id: so.id } })).status).toBe("PARTIALLY_DELIVERED");
    const d2 = await deliveries.createDelivery(ctx, so.id, {});
    await deliveries.completeDelivery(ctx, d2.id, { receivedByName: "العميل" });
    expect((await ctx.db.salesOrder.findUniqueOrThrow({ where: { id: so.id } })).status).toBe("DELIVERED");
    await expect(deliveries.createDelivery(ctx, so.id, {})).rejects.toMatchObject({ messageKey: "errors.nothingToDeliver" });
    await deliveries.updateInstallation(ctx, d1.id, { installationStatus: "COMPLETED" });

    // Invoice and final payment.
    const inv = await receivables.postInvoice(ctx, (await receivables.createInvoiceFromSalesOrder(ctx, so.id, {})).id);
    expect(inv.status).toBe("PARTIALLY_PAID");
    await receivables.createPayment(ctx, { customerId: customer.id, salesOrderId: so.id, cashAccountId: cash.id, amount: 10520, method: "CARD" });
    expect((await ctx.db.customerInvoice.findUniqueOrThrow({ where: { id: inv.id } })).status).toBe("PAID");
    expect(await customers.customerBalance(ctx, customer.id)).toBe(0);

    // Costing is fully traceable.
    const v = await manufacturing.costVariance(ctx, moId);
    expect(Number(v.actual.material)).toBe(1600); // 8 m² × 200
    expect(Number(v.actualTotal)).toBeGreaterThan(Number(v.actual.material));

    // Audit trail covers the key documents.
    const actions = (await ctx.db.auditLog.findMany({ where: { entityId: { in: [qt.id, so.id, moId, mi.id, inv.id] } }, select: { action: true } })).map((a) => a.action);
    for (const a of ["quotation.approved", "sales_order.create", "manufacturing.completed", "material_issue.post", "invoice.post"]) expect(actions).toContain(a);

    // Inventory ledger equals balances for the material.
    const ledger = await ctx.db.inventoryTransaction.aggregate({ where: { materialId: mdf.id }, _sum: { quantity: true } });
    const balance = await ctx.db.inventoryBalance.aggregate({ where: { materialId: mdf.id }, _sum: { quantity: true } });
    expect(Number(ledger._sum.quantity)).toBe(Number(balance._sum.quantity));
  });
});
