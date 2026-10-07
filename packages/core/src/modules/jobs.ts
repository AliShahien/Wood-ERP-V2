import type { Db } from "@edge/db";
import { expireQuotations } from "./quotations";
import { notify } from "./notifications";

/**
 * Scheduled checks. Triggered by cron (`POST /api/v1/cron/run` with CRON_SECRET) or the worker.
 * Every check is idempotent thanks to notification dedupe keys (one per entity per day).
 */
const day = () => new Date().toISOString().slice(0, 10);

export async function runScheduledChecks(db: Db) {
  const d = day();
  const result: Record<string, number> = {};

  result.quotationsExpired = await expireQuotations(db);

  const low = await db.$queryRaw<{ id: string; code: string; name: string; on_hand: string }[]>`
    SELECT m.id, m.code, m.name, COALESCE(SUM(b.quantity),0)::text AS on_hand
    FROM materials m LEFT JOIN inventory_balances b ON b.material_id = m.id
    WHERE m.deleted_at IS NULL AND m.status = 'ACTIVE' AND m.reorder_level > 0
    GROUP BY m.id HAVING COALESCE(SUM(b.quantity),0) <= m.reorder_level LIMIT 500`;
  result.lowStock = 0;
  for (const m of low) {
    result.lowStock += await notify(db, { type: "low_stock", permission: "inventory.view", params: { code: m.code, name: m.name, onHand: Number(m.on_hand) }, entityType: "material", entityId: m.id, dedupeKey: `low_stock:${m.id}:${d}` });
  }

  const overdue = await db.customerInvoice.findMany({ where: { status: { in: ["POSTED", "PARTIALLY_PAID"] }, dueDate: { lt: new Date() } }, select: { id: true, number: true, showroomId: true, customer: { select: { name: true } } }, take: 500 });
  result.overdue = 0;
  for (const i of overdue) {
    result.overdue += await notify(db, { type: "payment_overdue", permission: "invoices.view", params: { number: i.number, customer: i.customer.name }, entityType: "invoice", entityId: i.id, showroomId: i.showroomId, dedupeKey: `overdue:${i.id}:${d}` });
  }

  const soon = new Date(Date.now() + 3 * 86400_000);
  const supDue = await db.supplierInvoice.findMany({ where: { status: { in: ["POSTED", "PARTIALLY_PAID"] }, dueDate: { lte: soon } }, select: { id: true, number: true, supplier: { select: { name: true } } }, take: 500 });
  result.supplierDue = 0;
  for (const i of supDue) {
    result.supplierDue += await notify(db, { type: "supplier_payment_due", permission: "supplier_payments.create", params: { number: i.number, supplier: i.supplier.name }, entityType: "supplier_invoice", entityId: i.id, dedupeKey: `supdue:${i.id}:${d}` });
  }

  const delayed = await db.manufacturingOrder.findMany({ where: { requiredDate: { lt: new Date() }, status: { notIn: ["COMPLETED", "CANCELLED"] } }, select: { id: true, number: true }, take: 500 });
  result.delayed = 0;
  for (const m of delayed) {
    result.delayed += await notify(db, { type: "manufacturing_delayed", permission: "manufacturing.view", params: { number: m.number }, entityType: "manufacturing_order", entityId: m.id, dedupeKey: `delayed:${m.id}:${d}` });
  }

  // Housekeeping: expired sessions older than 30 days.
  const cleaned = await db.userSession.deleteMany({ where: { expiresAt: { lt: new Date(Date.now() - 30 * 86400_000) } } });
  result.sessionsCleaned = cleaned.count;
  return result;
}

// ───────────── Durable job queue (PostgreSQL, SKIP LOCKED) ─────────────

export type JobHandler = (payload: Record<string, unknown>, db: Db) => Promise<void>;
export const JOB_HANDLERS: Record<string, JobHandler> = {
  "scheduled.checks": async (_p, db) => { await runScheduledChecks(db); },
};

export async function enqueueJob(db: Pick<Db, "job">, type: string, payload: Record<string, unknown> = {}, runAt = new Date()) {
  return db.job.create({ data: { type, payload: payload as never, runAt } });
}

/** Claims and runs up to `limit` due jobs. Safe with several workers (FOR UPDATE SKIP LOCKED). */
export async function processJobs(db: Db, limit = 10) {
  let processed = 0;
  for (let i = 0; i < limit; i++) {
    const claimed = await db.$queryRaw<{ id: string }[]>`
      UPDATE jobs SET status = 'RUNNING', locked_at = now(), attempts = attempts + 1
      WHERE id = (SELECT id FROM jobs WHERE status = 'PENDING' AND run_at <= now() ORDER BY run_at FOR UPDATE SKIP LOCKED LIMIT 1)
      RETURNING id`;
    const id = claimed[0]?.id;
    if (!id) break;
    const job = await db.job.findUniqueOrThrow({ where: { id } });
    try {
      const h = JOB_HANDLERS[job.type];
      if (!h) throw new Error(`no handler for ${job.type}`);
      await h(job.payload as Record<string, unknown>, db);
      await db.job.update({ where: { id }, data: { status: "COMPLETED", completedAt: new Date(), lastError: null } });
    } catch (err) {
      const failed = job.attempts >= job.maxAttempts;
      await db.job.update({
        where: { id },
        data: { status: failed ? "FAILED" : "PENDING", lastError: String(err instanceof Error ? err.message : err).slice(0, 2000), runAt: new Date(Date.now() + 2 ** job.attempts * 60_000) },
      });
    }
    processed++;
  }
  return processed;
}
