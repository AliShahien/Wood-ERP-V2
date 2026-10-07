import { execSync } from "node:child_process";
import path from "node:path";
import pg from "pg";

/** Rebuilds the test database from migrations (validates migrations on every run) and seeds reference data. */
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL ?? "postgresql://edge:edge@localhost:54329/edge_erp_test";
  if (!/_test\b/.test(url)) throw new Error(`Refusing to reset a non-test database: ${url}`);

  const client = new pg.Client(url);
  await client.connect();
  await client.query("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;");
  await client.end();

  const root = path.resolve(import.meta.dirname, "..");
  const env = {
    ...process.env,
    DATABASE_URL: url,
    DIRECT_DATABASE_URL: url,
    SEED_ADMIN_USERNAME: "admin",
    SEED_ADMIN_PASSWORD: "Admin@12345",
    SEED_DEMO_DATA: "true",
    NODE_ENV: "test",
  };
  execSync("npx prisma migrate deploy", { cwd: path.join(root, "packages/db"), env, stdio: "pipe" });
  execSync("npx tsx ../core/scripts/seed.ts", { cwd: path.join(root, "packages/db"), env, stdio: "pipe" });
}
