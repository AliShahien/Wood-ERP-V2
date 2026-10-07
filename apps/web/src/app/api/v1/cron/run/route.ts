import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { jobs } from "@edge/core";
import { getDb } from "@edge/db";
import { log } from "@/server/log";

/**
 * Cron entry point for hosts without a worker process (e.g. Hostinger Node.js apps):
 *   curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://erp.example.com/api/v1/cron/run
 * Runs the scheduled checks and drains due queued jobs.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET ?? "";
  const given = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const ok = secret.length >= 8 && given.length === secret.length && timingSafeEqual(Buffer.from(given), Buffer.from(secret));
  if (!ok) return NextResponse.json({ error: { code: "UNAUTHENTICATED", messageKey: "errors.unauthenticated" } }, { status: 401 });
  const db = getDb();
  try {
    const checks = await jobs.runScheduledChecks(db);
    const processed = await jobs.processJobs(db, 50);
    log.info("cron.run", { ...checks, processed });
    return NextResponse.json({ ok: true, checks, processed });
  } catch (err) {
    log.error("cron.failed", { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: { code: "INTERNAL", messageKey: "errors.internal" } }, { status: 500 });
  }
}
