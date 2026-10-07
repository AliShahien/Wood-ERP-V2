// Volume check on the TEST database: inserts 200k synthetic customers (test DB only)
// and times the queries the app runs. Usage: node scripts/perf-check.mjs
import pg from "pg";

const url = process.env.TEST_DATABASE_URL ?? "postgresql://edge:edge@localhost:54329/edge_erp_test";
if (!/_test\b/.test(url)) throw new Error("perf check only runs against a *_test database");
const c = new pg.Client(url);
await c.connect();

const time = async (label, sql, params = []) => {
  const t = performance.now();
  const r = await c.query(sql, params);
  const ms = Math.round(performance.now() - t);
  console.log(`${label.padEnd(58)} ${String(ms).padStart(6)} ms  (${r.rowCount} rows)`);
  return ms;
};

const { rows: [{ n }] } = await c.query("SELECT COUNT(*)::int AS n FROM customers");
if (n < 200000) {
  console.log("seeding 200,000 customers …");
  await c.query(`INSERT INTO customers (id, code, name, phone, city, status, created_at, updated_at)
    SELECT gen_random_uuid(), 'PERF-' || g, 'عميل رقم ' || g || ' ' || md5(g::text), '010' || lpad(g::text, 8, '0'), 'القاهرة', 'ACTIVE', now() - (g || ' minutes')::interval, now()
    FROM generate_series(1, 200000) g`);
  await c.query("ANALYZE customers");
}
const results = {
  searchName: await time("customer search by name (ILIKE %term%, trgm)", "SELECT id, code, name FROM customers WHERE deleted_at IS NULL AND name ILIKE $1 ORDER BY created_at DESC LIMIT 20", ["%رقم 15432%"]),
  searchPhone: await time("customer search by phone fragment", "SELECT id FROM customers WHERE phone LIKE $1 LIMIT 20", ["%0015432%"]),
  page: await time("customer list page 500 (offset pagination)", "SELECT id, code, name FROM customers WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT 20 OFFSET 10000"),
  count: await time("customer count", "SELECT COUNT(*) FROM customers WHERE deleted_at IS NULL"),
};
const plan = await c.query("EXPLAIN SELECT id FROM customers WHERE name ILIKE '%رقم 15432%'");
console.log("plan:", plan.rows.map((r) => r["QUERY PLAN"]).join(" | ").slice(0, 200));
await c.end();
const slow = Object.entries(results).filter(([, ms]) => ms > 500);
console.log(slow.length ? `SLOW: ${slow.map(([k]) => k).join(", ")}` : "ALL QUERIES < 500 ms");
