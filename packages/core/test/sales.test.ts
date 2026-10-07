import { describe, expect, it } from "vitest";
import { computeTotals, unitPrice } from "../src/modules/pricing";
import * as quotations from "../src/modules/quotations";
import * as salesOrders from "../src/modules/sales-orders";
import * as receivables from "../src/modules/receivables";
import * as customers from "../src/modules/customers";
import * as products from "../src/modules/products";
import * as roles from "../src/modules/roles";
import * as users from "../src/modules/users";
import type { ServiceContext } from "../src/context";
import { adminCtx, ctxFor, uniq } from "./helpers";

describe("pricing engine", () => {
  it("prices per unit and per m² with fixed / per-m² / percent options", () => {
    expect(unitPrice({ pricingMethod: "PER_UNIT", basePrice: 5000, width: 900, height: 2100, options: [] }).toString()).toBe("5000");
    // area = 0.9 × 2.1 = 1.89 m² → 1000 × 1.89 = 1890
    expect(unitPrice({ pricingMethod: "PER_SQM", basePrice: 1000, width: 900, height: 2100, options: [] }).toString()).toBe("1890");
    const p = unitPrice({
      pricingMethod: "PER_UNIT", basePrice: 5000, width: 1000, height: 2000,
      options: [
        { priceMethod: "FIXED_PER_UNIT", priceAdjustment: 300 }, // +300
        { priceMethod: "PER_SQM", priceAdjustment: 100 }, // 2 m² → +200
        { priceMethod: "PERCENT", priceAdjustment: 10 }, // +500
      ],
    });
    expect(p.toString()).toBe("6000");
  });

  it("computes totals with optional tax, discounts and charges exactly", () => {
    const t = computeTotals({
      lines: [{ quantity: 2, unitPrice: "4500.50", discount: 1 }, { quantity: 1, unitPrice: 999.99 }],
      discountType: "PERCENT", discountValue: 10, installationCharge: 500, transportationCharge: 250, taxEnabled: true, taxRate: 14,
    });
    // 2 × 4500.50 − 1 + 999.99
    expect(t.subtotal.toString()).toBe("9999.99");
    // 10% = 999.999 → 1000.00
    expect(t.discountTotal.toString()).toBe("1000");
    // taxable = 9999.99 − 1000 + 750 = 9749.99 → 14% = 1364.9986 → 1365.00
    expect(t.taxTotal.toString()).toBe("1365");
    expect(t.total.toString()).toBe("11114.99");
    const noTax = computeTotals({ lines: [{ quantity: 1, unitPrice: 100 }], discountType: "AMOUNT", discountValue: 0, taxEnabled: false, taxRate: 14 });
    expect(noTax.taxTotal.toString()).toBe("0");
    expect(() => computeTotals({ lines: [{ quantity: 1, unitPrice: 100 }], discountType: "AMOUNT", discountValue: 101, taxEnabled: false, taxRate: 0 })).toThrow();
  });
});

async function fixture(ctx: ServiceContext) {
  const cat = await ctx.db.productCategory.findFirstOrThrow();
  const product = await products.createProduct(ctx, { name: `Door ${uniq()}`, categoryId: cat.id, status: "ACTIVE", basePrice: 5000, pricingMethod: "PER_UNIT", minWidth: 600, maxWidth: 1400 });
  const opt = await products.createOption(ctx, { code: `OPT${uniq().toUpperCase()}`, type: "FINISH", name: "Walnut stain", priceMethod: "FIXED_PER_UNIT", priceAdjustment: 500 });
  await products.setProductOptions(ctx, product.id, { options: [{ optionId: opt.id }] });
  const showroom = await ctx.db.showroom.findFirstOrThrow({ where: { code: "SR-01" } });
  const customer = await customers.createCustomer(ctx, { name: "عميل الاختبار", phone: "01000000000", showroomId: showroom.id });
  const cash = await ctx.db.cashAccount.findFirstOrThrow({ where: { code: "CASH-01" } });
  return { product, opt, customer, showroom, cash };
}

describe("quotation → sales order → invoice → payment", () => {
  it("runs the full sales cycle and balances to zero", async () => {
    const ctx = await adminCtx();
    const f = await fixture(ctx);
    const qt = await quotations.createQuotation(ctx, {
      customerId: f.customer.id, showroomId: f.showroom.id, taxEnabled: true, taxRate: 14, installationCharge: 1000,
      items: [{ productId: f.product.id, width: 900, height: 2100, quantity: 2, optionIds: [f.opt.id] }],
    });
    expect(qt.number).toMatch(/^QT-\d{4}-\d{6}$/);
    // (5000 + 500) × 2 = 11000; +1000 install = 12000; tax 14% = 1680 → 13680
    expect(qt.total.toString()).toBe("13680");
    await expect(quotations.approveQuotation(ctx, qt.id)).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
    await quotations.submitQuotation(ctx, qt.id);
    await quotations.approveQuotation(ctx, qt.id);
    await expect(quotations.updateQuotation(ctx, qt.id, { customerId: f.customer.id, items: [{ productId: f.product.id, width: 900, height: 2100, quantity: 1 }] })).rejects.toMatchObject({ code: "IMMUTABLE" });

    // Deposit before the order is invoiced.
    const so = await salesOrders.convertQuotation(ctx, qt.id, {});
    expect(so.number).toMatch(/^SO-\d{4}-\d{6}$/);
    expect((await ctx.db.quotation.findUniqueOrThrow({ where: { id: qt.id } })).status).toBe("CONVERTED");
    await receivables.createPayment(ctx, { customerId: f.customer.id, salesOrderId: so.id, cashAccountId: f.cash.id, amount: 5000, method: "CASH" });
    expect(await customers.customerBalance(ctx, f.customer.id)).toBe(-5000); // advance

    const inv = await receivables.createInvoiceFromSalesOrder(ctx, so.id, {});
    expect(inv.total.toString()).toBe("13680");
    const posted = await receivables.postInvoice(ctx, inv.id);
    expect(posted.status).toBe("PARTIALLY_PAID"); // deposit auto-applied
    expect(posted.paidAmount.toString()).toBe("5000");
    expect(await customers.customerBalance(ctx, f.customer.id)).toBe(8680);

    await receivables.createPayment(ctx, { customerId: f.customer.id, salesOrderId: so.id, cashAccountId: f.cash.id, amount: 8680, method: "BANK_TRANSFER" });
    const paid = await ctx.db.customerInvoice.findUniqueOrThrow({ where: { id: inv.id } });
    expect(paid.status).toBe("PAID");
    expect(await customers.customerBalance(ctx, f.customer.id)).toBe(0);
    await expect(receivables.createInvoiceFromSalesOrder(ctx, so.id, {})).rejects.toMatchObject({ messageKey: "errors.nothingToInvoice" });
  });

  it("reversing a payment restores the balance and invoice status; nothing is deleted", async () => {
    const ctx = await adminCtx();
    const f = await fixture(ctx);
    const qt = await quotations.createQuotation(ctx, { customerId: f.customer.id, items: [{ productId: f.product.id, width: 900, height: 2000, quantity: 1 }] });
    await quotations.submitQuotation(ctx, qt.id);
    await quotations.approveQuotation(ctx, qt.id);
    const so = await salesOrders.convertQuotation(ctx, qt.id, {});
    const inv = await receivables.postInvoice(ctx, (await receivables.createInvoiceFromSalesOrder(ctx, so.id, {})).id);
    const pay = await receivables.createPayment(ctx, { customerId: f.customer.id, cashAccountId: f.cash.id, amount: Number(inv.total), method: "CASH" });
    expect(await customers.customerBalance(ctx, f.customer.id)).toBe(0);
    await receivables.reversePayment(ctx, pay.id, { reason: "cheque bounced" });
    expect(await customers.customerBalance(ctx, f.customer.id)).toBe(Number(inv.total));
    expect((await ctx.db.customerInvoice.findUniqueOrThrow({ where: { id: inv.id } })).status).toBe("POSTED");
    expect(await ctx.db.customerPayment.count({ where: { id: pay.id } })).toBe(1);
    await expect(receivables.reversePayment(ctx, pay.id, { reason: "again" })).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
    await expect(ctx.db.customerPayment.delete({ where: { id: pay.id } })).rejects.toThrow();
    const cashNet = await ctx.db.cashTransaction.findMany({ where: { sourceId: pay.id } });
    expect(cashNet).toHaveLength(2);
  });

  it("two concurrent conversions of the same quotation create exactly one sales order", async () => {
    const ctx = await adminCtx();
    const f = await fixture(ctx);
    const qt = await quotations.createQuotation(ctx, { customerId: f.customer.id, items: [{ productId: f.product.id, width: 800, height: 2000, quantity: 1 }] });
    await quotations.submitQuotation(ctx, qt.id);
    await quotations.approveQuotation(ctx, qt.id);
    const results = await Promise.allSettled([salesOrders.convertQuotation(ctx, qt.id, {}), salesOrders.convertQuotation(ctx, qt.id, {})]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await ctx.db.salesOrder.count({ where: { quotationId: qt.id } })).toBe(1);
  });

  it("rejects out-of-range sizes, unavailable options and unauthorized price overrides", async () => {
    const ctx = await adminCtx();
    const f = await fixture(ctx);
    await expect(quotations.createQuotation(ctx, { customerId: f.customer.id, items: [{ productId: f.product.id, width: 2000, height: 2100, quantity: 1 }] })).rejects.toMatchObject({ messageKey: "errors.sizeOutOfRange" });
    const other = await products.createOption(ctx, { code: `X${uniq().toUpperCase()}`, type: "COLOR", name: "Red" });
    await expect(quotations.createQuotation(ctx, { customerId: f.customer.id, items: [{ productId: f.product.id, width: 900, height: 2100, quantity: 1, optionIds: [other.id] }] })).rejects.toMatchObject({ messageKey: "errors.optionNotAvailable" });

    const role = await roles.createRole(ctx, { code: `SALES_${uniq().toUpperCase()}`, nameAr: "مبيعات", nameEn: "Sales", dataScope: "ALL", permissions: ["quotations.create", "quotations.view", "customers.view"] });
    const u = await users.createUser(ctx, { fullName: "Sales", username: `sl${uniq()}`, password: "Passw0rd1", roleIds: [role.id], showroomId: f.showroom.id });
    const sctx = await ctxFor(u.id);
    await expect(quotations.createQuotation(sctx, { customerId: f.customer.id, items: [{ productId: f.product.id, width: 900, height: 2100, quantity: 1, unitPrice: 1 }] })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const ok = await quotations.createQuotation(sctx, { customerId: f.customer.id, items: [{ productId: f.product.id, width: 900, height: 2100, quantity: 1, unitPrice: 5000 }] });
    expect(ok.total.toString()).toBe("5000");
  });

  it("revising an approved quotation creates a new draft revision and keeps the original", async () => {
    const ctx = await adminCtx();
    const f = await fixture(ctx);
    const qt = await quotations.createQuotation(ctx, { customerId: f.customer.id, items: [{ productId: f.product.id, width: 900, height: 2100, quantity: 1 }] });
    await quotations.submitQuotation(ctx, qt.id);
    await quotations.approveQuotation(ctx, qt.id);
    const rev = await quotations.reviseQuotation(ctx, qt.id);
    expect(rev.number).toBe(`${qt.number}-R1`);
    expect(rev.status).toBe("DRAFT");
    expect((await ctx.db.quotation.findUniqueOrThrow({ where: { id: qt.id } })).status).toBe("APPROVED");
  });
});
