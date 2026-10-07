// Application-level logical backup: every public table → gzip'd "table<TAB>row-json" lines, in
// foreign-key order, from one consistent snapshot. Rows are kept as PostgreSQL's own JSON text
// (never parsed by JavaScript), so numeric precision is preserved exactly.
// Complements Supabase backups / pg_dump; works anywhere Node runs.
//   node scripts/backup.mjs [outFile]      (BACKUP_DATABASE_URL | DIRECT_DATABASE_URL | DATABASE_URL)
import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { createGzip } from "node:zlib";
import { config } from "dotenv";
import pg from "pg";

config({ path: path.resolve(import.meta.dirname, "../.env") });
pg.types.setTypeParser(114, (v) => v); // json → raw text

// Append-only tables: rows are never updated (DB trigger), so self-references rely on id order.
const IMMUTABLE = new Set(["audit_logs", "inventory_transactions", "party_ledger_entries", "cash_transactions"]);

/**
 * FK-safe table order. Cycles (e.g. users.showroom_id ↔ showrooms.manager_id) and self-references
 * on mutable tables are broken by "deferred" nullable columns: restored as NULL first, then updated.
 */
export async function tableOrder(client) {
  const { rows: tables } = await client.query(`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations'`);
  const { rows: fks } = await client.query(`
    SELECT tc.relname AS child, pc.relname AS parent, a.attname AS col, NOT a.attnotnull AS nullable
    FROM pg_constraint c
    JOIN pg_class tc ON tc.oid = c.conrelid JOIN pg_class pc ON pc.oid = c.confrelid
    JOIN pg_namespace n ON n.oid = tc.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
    WHERE c.contype='f' AND n.nspname='public'`);
  const names = tables.map((t) => t.tablename);
  const deferred = fks.filter((f) => f.child === f.parent && !IMMUTABLE.has(f.child)).map((f) => ({ table: f.child, column: f.col }));
  let edges = fks.filter((f) => f.child !== f.parent);
  const order = [];
  while (order.length < names.length) {
    const remaining = names.filter((n) => !order.includes(n));
    const ready = remaining.filter((n) => edges.filter((e) => e.child === n).every((e) => order.includes(e.parent)));
    if (ready.length) { order.push(...ready.sort()); continue; }
    const cut = edges.find((e) => e.nullable && remaining.includes(e.child) && remaining.includes(e.parent));
    if (!cut) throw new Error("FK cycle without a nullable column");
    deferred.push({ table: cut.child, column: cut.col });
    edges = edges.filter((e) => e !== cut);
  }
  return { order, deferred };
}

async function main() {
  const url = process.env.BACKUP_DATABASE_URL ?? process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
  const out = process.argv[2] ?? path.resolve(import.meta.dirname, `../.local/backups/edge-erp-${new Date().toISOString().replace(/[:.]/g, "-")}.edgebak.gz`);
  await mkdir(path.dirname(out), { recursive: true });
  const c = new pg.Client(url);
  await c.connect();
  await c.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  const { order, deferred } = await tableOrder(c);
  const { rows: idCols } = await c.query(`SELECT table_name FROM information_schema.columns WHERE table_schema='public' AND column_name='id'`);
  const hasId = new Set(idCols.map((r) => r.table_name));
  const gz = createGzip();
  const file = createWriteStream(out);
  gz.pipe(file);
  const write = (s) => new Promise((r) => (gz.write(`${s}\n`) ? r() : gz.once("drain", r)));
  await write(`#header\t${JSON.stringify({ version: 1, createdAt: new Date().toISOString(), tables: order, deferred })}`);
  const counts = {};
  for (const t of order) {
    counts[t] = 0;
    // UUIDv7 / serial ids are creation-ordered: referenced rows (e.g. reversed entries) come first.
    await c.query(`DECLARE cur NO SCROLL CURSOR FOR SELECT row_to_json(x) AS r FROM "${t}" x${hasId.has(t) ? " ORDER BY id" : ""}`);
    for (;;) {
      const { rows } = await c.query("FETCH 2000 FROM cur");
      if (!rows.length) break;
      for (const { r } of rows) await write(`${t}\t${r}`);
      counts[t] += rows.length;
    }
    await c.query("CLOSE cur");
  }
  await write(`#footer\t${JSON.stringify({ counts })}`);
  await c.query("COMMIT");
  await c.end();
  gz.end();
  await new Promise((r) => file.on("close", r));
  console.log(JSON.stringify({ file: out, tables: order.length, rows: Object.values(counts).reduce((a, b) => a + b, 0) }));
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, "/")}`) await main();
