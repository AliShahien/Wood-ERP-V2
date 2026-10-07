// End-to-end restore test: backup the dev DB → fresh DB → migrate → restore → compare.
//   node scripts/restore-test.mjs
import { execSync } from "node:child_process";
import path from "node:path";
import { createHash } from "node:crypto";
import pg from "pg";

const root = path.resolve(import.meta.dirname, "..");
const src = process.env.DIRECT_DATABASE_URL ?? "postgresql://edge:edge@localhost:54329/edge_erp";
const target = src.replace(/\/[^/?]+(\?|$)/, "/edge_erp_restore$1");
const admin = src.replace(/\/[^/?]+(\?|$)/, "/postgres$1");
const file = path.join(root, ".local", "backups", "restore-test.edgebak.gz");
const started = Date.now();

const a = new pg.Client(admin);
await a.connect();
await a.query("DROP DATABASE IF EXISTS edge_erp_restore WITH (FORCE)");
await a.query("CREATE DATABASE edge_erp_restore ENCODING 'UTF8' TEMPLATE template0");
await a.end();

const env = { ...process.env, DATABASE_URL: target, DIRECT_DATABASE_URL: target };
execSync(`node scripts/backup.mjs "${file}"`, { cwd: root, stdio: "inherit", env: { ...process.env, BACKUP_DATABASE_URL: src } });
execSync("npx prisma migrate deploy", { cwd: path.join(root, "packages/db"), env, stdio: "pipe" });
execSync(`node scripts/restore.mjs "${file}"`, { cwd: root, stdio: "inherit", env: { ...process.env, RESTORE_DATABASE_URL: target } });

// Verify: identical row counts and identical content checksums on the financial / stock tables.
const checks = ["inventory_transactions", "inventory_balances", "party_ledger_entries", "cash_transactions", "customer_invoices", "customer_payments", "materials", "audit_logs", "users"];
const digest = async (url, t) => {
  const c = new pg.Client(url);
  await c.connect();
  const { rows } = await c.query(`SELECT COUNT(*)::int AS n, COALESCE(md5(string_agg(x::text, '|' ORDER BY x::text)), '') AS h FROM "${t}" x`);
  await c.end();
  return rows[0];
};
let ok = true;
for (const t of checks) {
  const [s, r] = [await digest(src, t), await digest(target, t)];
  const same = s.n === r.n && s.h === r.h;
  ok &&= same;
  console.log(`${same ? "OK  " : "DIFF"} ${t.padEnd(26)} rows=${s.n}/${r.n}`);
}
// The restored database must still enforce its integrity rules.
const c = new pg.Client(target);
await c.connect();
let immutable = false;
try { await c.query("UPDATE audit_logs SET action = 'x' WHERE id = (SELECT MIN(id) FROM audit_logs)"); } catch (e) { immutable = /EDGE_IMMUTABLE/.test(String(e)); }
await c.end();
console.log(`${immutable ? "OK  " : "DIFF"} immutability triggers active after restore`);
console.log(JSON.stringify({ result: ok && immutable ? "PASS" : "FAIL", seconds: Math.round((Date.now() - started) / 1000), hash: createHash("sha256").update(file).digest("hex").slice(0, 8) }));
if (!(ok && immutable)) process.exit(1);
