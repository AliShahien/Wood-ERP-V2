import { describe, expect, it } from "vitest";
import { nextNumber, formatNumber } from "../src/platform/numbering";
import { assertTransition, MANUFACTURING_TRANSITIONS, QUOTATION_TRANSITIONS } from "../src/platform/state-machine";
import { adminCtx, testDb } from "./helpers";

describe("document numbering", () => {
  it("formats yearly and global numbers", () => {
    expect(formatNumber("QT", 2026, 1)).toBe("QT-2026-000001");
    expect(formatNumber("CUS", 0, 42)).toBe("CUS-000042");
  });

  it("is unique and gap-free under 50 concurrent transactions", async () => {
    const db = testDb();
    const date = new Date(Date.UTC(2031, 5, 1));
    const results = await Promise.all(
      Array.from({ length: 50 }, () => db.$transaction((tx) => nextNumber(tx, "QUOTATION", date))),
    );
    const serials = results.map((n) => Number(n.split("-")[2])).sort((a, b) => a - b);
    expect(new Set(results).size).toBe(50);
    expect(serials).toEqual(Array.from({ length: 50 }, (_, i) => i + 1));
  });

  it("does not consume a number when the transaction rolls back", async () => {
    const db = testDb();
    const date = new Date(Date.UTC(2032, 0, 1));
    await expect(
      db.$transaction(async (tx) => {
        await nextNumber(tx, "INVOICE", date);
        throw new Error("rollback");
      }),
    ).rejects.toThrow("rollback");
    const n = await db.$transaction((tx) => nextNumber(tx, "INVOICE", date));
    expect(n).toBe("INV-2032-000001");
  });
});

describe("status transitions", () => {
  it("allows valid and rejects invalid transitions", () => {
    expect(() => assertTransition("quotation", QUOTATION_TRANSITIONS, "DRAFT", "SUBMITTED")).not.toThrow();
    expect(() => assertTransition("quotation", QUOTATION_TRANSITIONS, "DRAFT", "APPROVED")).toThrow(/invalidTransition/);
    expect(() => assertTransition("mo", MANUFACTURING_TRANSITIONS, "IN_PRODUCTION", "COMPLETED")).toThrow();
    expect(() => assertTransition("mo", MANUFACTURING_TRANSITIONS, "QUALITY_CHECK", "IN_PRODUCTION")).not.toThrow();
  });
});

describe("database integrity guards", () => {
  it("audit logs cannot be updated or deleted", async () => {
    const ctx = await adminCtx();
    const row = await ctx.db.auditLog.create({ data: { action: "test.event", entityType: "test", userId: ctx.actor.userId } });
    await expect(ctx.db.auditLog.update({ where: { id: row.id }, data: { action: "tampered" } })).rejects.toThrow(/EDGE_IMMUTABLE/);
    await expect(ctx.db.auditLog.delete({ where: { id: row.id } })).rejects.toThrow(/EDGE_IMMUTABLE/);
  });

  it("inventory balance can never go negative", async () => {
    const db = testDb();
    const material = await db.material.findFirstOrThrow();
    const warehouse = await db.warehouse.findFirstOrThrow();
    await expect(
      db.inventoryBalance.create({ data: { materialId: material.id, warehouseId: warehouse.id, quantity: -1 } }),
    ).rejects.toThrow(/inventory_balances_qty_nonneg/);
  });

  it("every public table has row level security enabled", async () => {
    const db = testDb();
    const rows = await db.$queryRaw<{ tablename: string }[]>`
      SELECT c.relname AS tablename FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity`;
    expect(rows.map((r) => r.tablename)).toEqual([]);
  });
});
