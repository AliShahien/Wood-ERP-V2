// Local development PostgreSQL (real PostgreSQL 17 binaries via embedded-postgres).
// Used when Docker is not available. Data lives in .local/pgdata (git-ignored).
//
//   npm run db:local            -> start (initialises on first run), Ctrl+C to stop
//
// Connection: postgresql://edge:edge@localhost:54329/edge_erp
import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const dataDir = path.join(root, ".local", "pgdata");
const port = Number(process.env.LOCAL_PG_PORT ?? 54329);

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: "edge",
  password: "edge",
  port,
  persistent: true,
  // Arabic data requires UTF-8 (Windows would otherwise default to WIN1252).
  initdbFlags: ["--encoding=UTF8", "--locale=C", "--lc-collate=C", "--lc-ctype=C"],
  onLog: () => {},
});

const fresh = !existsSync(path.join(dataDir, "PG_VERSION"));
if (fresh) {
  console.log("Initialising local PostgreSQL cluster ...");
  await pg.initialise();
}
await pg.start();
if (fresh) {
  await pg.createDatabase("edge_erp");
  await pg.createDatabase("edge_erp_test");
}
console.log(`PostgreSQL running on port ${port} (databases: edge_erp, edge_erp_test). Ctrl+C to stop.`);

const stop = async () => {
  await pg.stop();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
