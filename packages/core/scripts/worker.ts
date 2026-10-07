/**
 * Background worker (Docker/VPS): drains the PostgreSQL job queue every 30 s and runs the
 * scheduled checks every 15 min. Run: npm run worker
 */
import path from "node:path";
import { config as loadEnv } from "dotenv";

loadEnv({ path: path.resolve(import.meta.dirname, "../../../.env") });
const { createDb } = await import("@edge/db");
const { processJobs, runScheduledChecks } = await import("../src/modules/jobs");

const db = createDb();
let stopping = false;
const log = (level: string, msg: string, fields: Record<string, unknown> = {}) => console.log(JSON.stringify({ level, time: new Date().toISOString(), msg, ...fields }));

async function loop() {
  let lastChecks = 0;
  while (!stopping) {
    try {
      if (Date.now() - lastChecks > 15 * 60_000) {
        log("info", "worker.checks", await runScheduledChecks(db));
        lastChecks = Date.now();
      }
      const n = await processJobs(db, 20);
      if (n) log("info", "worker.jobs", { processed: n });
    } catch (err) {
      log("error", "worker.failed", { error: err instanceof Error ? err.message : String(err) });
    }
    await new Promise((r) => setTimeout(r, 30_000));
  }
  await db.$disconnect();
}

for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => { stopping = true; });
log("info", "worker.start");
await loop();
