import type { Tx } from "@edge/db";
import type { ServiceContext } from "../context";
import { AppError } from "../errors";
import { D, money, ZERO, type Dec } from "./money";

export type StockTxType =
  | "OPENING_BALANCE" | "PURCHASE_RECEIPT" | "MATERIAL_ISSUE" | "PRODUCTION_RETURN" | "PRODUCTION_CONSUMPTION"
  | "TRANSFER_OUT" | "TRANSFER_IN" | "ADJUSTMENT_IN" | "ADJUSTMENT_OUT" | "REVERSAL";

export interface StockLine {
  materialId: string;
  warehouseId: string;
  /** Signed quantity in the material's unit: + into stock, − out of stock. */
  quantity: Dec | number | string;
  /** Cost per unit. Omit to use the current moving average (issues, transfers, negative adjustments). */
  unitCost?: Dec | number | string | null;
  type: StockTxType;
  notes?: string | null;
  reversalOfId?: string | null;
}

export interface StockRef {
  type: string; // referenceType, e.g. "goods_receipt"
  id: string;
  number: string;
  date: Date;
}

export interface PostedStockLine {
  transactionId: string;
  materialId: string;
  warehouseId: string;
  quantity: Dec;
  unitCost: Dec;
  totalCost: Dec;
}

/**
 * The single entry point that changes stock. Inside the caller's DB transaction it:
 *  1. locks the material rows, then the balance rows, in a fixed order (no deadlocks),
 *  2. refuses any movement that would make a warehouse balance negative,
 *  3. maintains the moving weighted average cost per material (all warehouses),
 *  4. appends immutable ledger rows and updates balances.
 * Concurrent postings on the same material/warehouse therefore serialize and can never
 * consume the same stock twice.
 */
export async function postStock(tx: Tx, ctx: Pick<ServiceContext, "actor">, ref: StockRef, lines: StockLine[]): Promise<PostedStockLine[]> {
  if (!lines.length) return [];
  const materialIds = [...new Set(lines.map((l) => l.materialId))].sort();
  const pairs = [...new Set(lines.map((l) => `${l.materialId}|${l.warehouseId}`))].sort();

  await tx.$queryRawUnsafe(`SELECT id FROM materials WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE`, materialIds);
  for (const p of pairs) {
    const [m, w] = p.split("|");
    await tx.$executeRaw`INSERT INTO inventory_balances (material_id, warehouse_id, quantity, updated_at) VALUES (${m}::uuid, ${w}::uuid, 0, now()) ON CONFLICT DO NOTHING`;
  }
  const balanceRows = await tx.$queryRawUnsafe<{ material_id: string; warehouse_id: string; quantity: string }[]>(
    `SELECT material_id, warehouse_id, quantity::text FROM inventory_balances
     WHERE (material_id::text || '|' || warehouse_id::text) = ANY($1::text[])
     ORDER BY material_id, warehouse_id FOR UPDATE`,
    pairs,
  );
  const balances = new Map(balanceRows.map((r) => [`${r.material_id}|${r.warehouse_id}`, D(r.quantity)]));

  const mats = await tx.material.findMany({ where: { id: { in: materialIds } }, select: { id: true, name: true, averageCost: true } });
  const avg = new Map(mats.map((m) => [m.id, D(m.averageCost)]));
  const names = new Map(mats.map((m) => [m.id, m.name]));
  const totals = new Map<string, Dec>();
  for (const id of materialIds) {
    const agg = await tx.inventoryBalance.aggregate({ where: { materialId: id }, _sum: { quantity: true } });
    totals.set(id, D(agg._sum.quantity ?? 0));
  }

  const shortages: { materialId: string; name: string; warehouseId: string; available: string; requested: string }[] = [];
  const posted: PostedStockLine[] = [];
  for (const l of lines) {
    const key = `${l.materialId}|${l.warehouseId}`;
    const q = D(l.quantity);
    if (q.isZero()) continue;
    const current = balances.get(key) ?? ZERO;
    const after = current.plus(q);
    if (after.isNegative()) {
      shortages.push({ materialId: l.materialId, name: names.get(l.materialId) ?? "", warehouseId: l.warehouseId, available: current.toString(), requested: q.negated().toString() });
      continue;
    }
    const a = avg.get(l.materialId) ?? ZERO;
    const cost = l.unitCost != null ? D(l.unitCost) : a;
    if (cost.isNegative()) throw new AppError("VALIDATION", "errors.validation", [{ path: "unitCost", code: "negative" }]);
    const total = totals.get(l.materialId) ?? ZERO;
    const newTotal = total.plus(q);
    // Moving weighted average (outs at average leave it unchanged).
    if (newTotal.greaterThan(0)) avg.set(l.materialId, total.times(a).plus(q.times(cost)).div(newTotal).toDecimalPlaces(4));
    totals.set(l.materialId, newTotal);
    balances.set(key, after);

    const row = await tx.inventoryTransaction.create({
      data: {
        type: l.type, materialId: l.materialId, warehouseId: l.warehouseId, quantity: q, unitCost: cost.toDecimalPlaces(4),
        totalCost: money(q.times(cost)), balanceAfter: after, referenceType: ref.type, referenceId: ref.id, referenceNumber: ref.number,
        reversalOfId: l.reversalOfId ?? null, notes: l.notes ?? null, transactionDate: ref.date, createdById: ctx.actor.userId,
      },
    });
    posted.push({ transactionId: row.id, materialId: l.materialId, warehouseId: l.warehouseId, quantity: q, unitCost: cost, totalCost: money(q.times(cost)) });
  }
  if (shortages.length) throw new AppError("INSUFFICIENT_STOCK", "errors.insufficientStock", shortages);

  for (const [key, qty] of balances) {
    const [m, w] = key.split("|");
    await tx.inventoryBalance.update({ where: { materialId_warehouseId: { materialId: m!, warehouseId: w! } }, data: { quantity: qty } });
  }
  for (const [id, a] of avg) {
    const purchase = lines.filter((l) => l.materialId === id && l.type === "PURCHASE_RECEIPT" && l.unitCost != null).at(-1);
    await tx.material.update({ where: { id }, data: { averageCost: a, ...(purchase ? { lastPurchaseCost: D(purchase.unitCost!) } : {}) } });
  }
  return posted;
}

/** Mirrors every not-yet-reversed ledger row of a document (opposite sign, original cost). */
export async function reverseStock(tx: Tx, ctx: Pick<ServiceContext, "actor">, ref: StockRef, reason: string) {
  const originals = await tx.inventoryTransaction.findMany({
    where: { referenceId: ref.id, reversalOfId: null, reversedBy: null, NOT: { type: "REVERSAL" } },
    orderBy: { createdAt: "asc" },
  });
  return postStock(
    tx,
    ctx,
    ref,
    originals.map((o) => ({
      materialId: o.materialId, warehouseId: o.warehouseId, quantity: D(o.quantity).negated(), unitCost: o.unitCost,
      type: "REVERSAL" as const, notes: reason, reversalOfId: o.id,
    })),
  );
}

/** Available quantity per material in a warehouse (no lock — for display / pre-checks only). */
export async function availability(tx: Pick<Tx, "inventoryBalance">, warehouseId: string, materialIds: string[]) {
  const rows = await tx.inventoryBalance.findMany({ where: { warehouseId, materialId: { in: materialIds } } });
  return new Map(rows.map((r) => [r.materialId, D(r.quantity)]));
}
