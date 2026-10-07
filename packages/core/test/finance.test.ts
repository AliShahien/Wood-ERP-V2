import { describe, expect, it } from "vitest";
import * as expenses from "../src/modules/expenses";
import * as reports from "../src/modules/reports";
import * as cashAccounts from "../src/modules/cash-accounts";
import * as roles from "../src/modules/roles";
import * as users from "../src/modules/users";
import { adminCtx, ctxFor, uniq } from "./helpers";

describe("expenses", () => {
  it("posts cash out, cancels with a reversal and never deletes", async () => {
    const ctx = await adminCtx();
    const cat = await ctx.db.expenseCategory.findUniqueOrThrow({ where: { code: "ELECTRICITY" } });
    const acc = await cashAccounts.createCashAccount(ctx, { code: `C${uniq().toUpperCase()}`, name: "خزينة اختبار", type: "CASH" });
    const before = (await cashAccounts.listCashAccounts(ctx)).find((a) => a.id === acc.id)!.balance;
    const e = await expenses.createExpense(ctx, { categoryId: cat.id, amount: 1250.5, method: "CASH", cashAccountId: acc.id, description: "فاتورة كهرباء سبتمبر" });
    expect(e.number).toMatch(/^EXP-\d{4}-\d{6}$/);
    let bal = (await cashAccounts.listCashAccounts(ctx)).find((a) => a.id === acc.id)!.balance;
    expect(bal).toBeCloseTo((before ?? 0) - 1250.5);
    await expenses.cancelExpense(ctx, e.id, { reason: "duplicate" });
    bal = (await cashAccounts.listCashAccounts(ctx)).find((a) => a.id === acc.id)!.balance;
    expect(bal).toBeCloseTo(before ?? 0);
    await expect(expenses.cancelExpense(ctx, e.id, { reason: "again" })).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
    await expect(ctx.db.expense.delete({ where: { id: e.id } })).rejects.toThrow();
  });
});

describe("reports", () => {
  it("run from database data only and respect permissions", async () => {
    const ctx = await adminCtx();
    const list = reports.availableReports(ctx);
    expect(list.length).toBe(Object.keys(reports.REPORTS).length);
    for (const r of list) {
      const res = await reports.runReport(ctx, r.id, {});
      expect(Array.isArray(res.rows)).toBe(true);
      expect(res.columns.length).toBeGreaterThan(0);
    }
    const sales = await reports.runReport(ctx, "sales", {});
    const dbTotal = await ctx.db.customerInvoice.aggregate({ where: { status: { in: ["POSTED", "PARTIALLY_PAID", "PAID"] } }, _sum: { total: true } });
    expect(sales.totals?.total ?? 0).toBeCloseTo(Number(dbTotal._sum.total ?? 0), 2);

    const role = await roles.createRole(ctx, { code: `REP_${uniq().toUpperCase()}`, nameAr: "تقارير", nameEn: "Reports", dataScope: "ALL", permissions: ["reports.view", "customers.view"] });
    const u = await users.createUser(ctx, { fullName: "R", username: `rep${uniq()}`, password: "Passw0rd1", roleIds: [role.id] });
    const rctx = await ctxFor(u.id);
    expect(reports.availableReports(rctx).map((r) => r.id)).toEqual(["customers"]);
    await expect(reports.runReport(rctx, "manufacturing_cost", {})).rejects.toMatchObject({ code: "FORBIDDEN" });
    const cust = await reports.runReport(rctx, "customers", {});
    expect(cust.columns.map((c) => c.key)).not.toContain("balance"); // no payments.view
  });
});
