// Restores a backup made by scripts/backup.mjs into an EMPTY database that already has the
// schema (`prisma migrate deploy` first). PostgreSQL itself parses every row
// (json_populate_recordset), so types and numeric precision are exact. Deferred (cyclic /
// self-referencing) FK columns are inserted as NULL and filled in at the end.
// Refuses non-empty targets.
//   RESTORE_DATABASE_URL=postgresql://…/edge_erp_restore node scripts/restore.mjs <file.edgebak.gz>
import { createReadStream } from "node:fs";
import readline from "node:readline";
import { createGunzip } from "node:zlib";
import pg from "pg";

const url = process.env.RESTORE_DATABASE_URL;
const file = process.argv[2];
if (!url || !file) throw new Error("RESTORE_DATABASE_URL and a backup file are required");

const c = new pg.Client(url);
await c.connect();
const { rows: [{ n }] } = await c.query("SELECT COUNT(*)::int AS n FROM users");
if (n > 0) throw new Error("Target database is not empty — refusing to restore");

// json_populate_recordset turns a JSON `null` into SQL NULL; NOT NULL jsonb columns must get 'null'::jsonb back.
const { rows: colRows } = await c.query(`SELECT table_name, column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema='public' ORDER BY ordinal_position`);
const selectList = new Map();
for (const r of colRows) {
  const expr = (r.data_type === "jsonb" || r.data_type === "json") && r.is_nullable === "NO" ? `COALESCE(r."${r.column_name}", 'null'::${r.data_type})` : `r."${r.column_name}"`;
  selectList.set(r.table_name, [...(selectList.get(r.table_name) ?? []), { col: r.column_name, expr }]);
}
const insertSql = (t, source) => {
  const cols = selectList.get(t);
  return `INSERT INTO "${t}" (${cols.map((x) => `"${x.col}"`).join(",")}) SELECT ${cols.map((x) => x.expr).join(",")} FROM ${source} r`;
};

await c.query("BEGIN");
await c.query("CREATE TEMP TABLE _deferred (tbl text, id text, col text, val text) ON COMMIT DROP");
const counts = {};
let footer = null;
let deferredByTable = new Map();
let current = null;
let batch = [];

async function flush() {
  if (!batch.length) return;
  const payload = `[${batch.join(",")}]`;
  const cols = deferredByTable.get(current) ?? [];
  if (cols.length) {
    const strip = cols.map((col) => ` - '${col}'`).join("");
    await c.query(insertSql(current, `json_populate_recordset(NULL::"${current}", (SELECT json_agg(e${strip}) FROM jsonb_array_elements($1::jsonb) e))`), [payload]);
    for (const col of cols) {
      await c.query(`INSERT INTO _deferred SELECT $2, e->>'id', $3, e->>$3 FROM jsonb_array_elements($1::jsonb) e WHERE e->>$3 IS NOT NULL`, [payload, current, col]);
    }
  } else {
    await c.query(insertSql(current, `json_populate_recordset(NULL::"${current}", $1::json)`), [payload]);
  }
  counts[current] = (counts[current] ?? 0) + batch.length;
  batch = [];
}

const rl = readline.createInterface({ input: createReadStream(file).pipe(createGunzip()), crlfDelay: Infinity });
for await (const line of rl) {
  if (!line) continue;
  const tab = line.indexOf("\t");
  const table = line.slice(0, tab);
  const payload = line.slice(tab + 1);
  if (table === "#header") {
    const h = JSON.parse(payload);
    for (const d of h.deferred ?? []) deferredByTable.set(d.table, [...(deferredByTable.get(d.table) ?? []), d.column]);
    continue;
  }
  if (table === "#footer") { footer = JSON.parse(payload); continue; }
  if (table !== current || batch.length >= 1000) { await flush(); current = table; }
  batch.push(payload);
}
await flush();

for (const [table, cols] of deferredByTable) {
  for (const col of cols) {
    await c.query(`UPDATE "${table}" t SET "${col}" = d.val::uuid FROM _deferred d WHERE d.tbl = $1 AND d.col = $2 AND t.id::text = d.id`, [table, col]);
  }
}
await c.query(`SELECT setval(pg_get_serial_sequence('audit_logs','id'), GREATEST(COALESCE((SELECT MAX(id) FROM audit_logs), 0), 1))`);
await c.query("COMMIT");
await c.end();

const mismatches = Object.entries(footer?.counts ?? {}).filter(([t, cnt]) => (counts[t] ?? 0) !== cnt);
console.log(JSON.stringify({ restoredRows: Object.values(counts).reduce((a, b) => a + b, 0), tables: Object.keys(counts).length, deferred: [...deferredByTable.entries()].map(([t, c]) => `${t}.${c.join("+")}`), mismatches }));
if (mismatches.length) process.exit(1);
