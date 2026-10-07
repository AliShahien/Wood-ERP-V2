import path from "node:path";
import { config as loadEnv } from "dotenv";
import { defineConfig } from "prisma/config";

// Load the monorepo root .env (the CLI runs from packages/db).
loadEnv({ path: path.resolve(import.meta.dirname, "../../.env") });

// Migrations must use a DIRECT (non-pooled) connection: Supabase's transaction pooler
// (port 6543) does not support the session features Prisma Migrate relies on.
const url = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  migrations: {
    path: path.join("prisma", "migrations"),
    seed: "tsx ../core/scripts/seed.ts",
  },
  datasource: {
    url: url ?? "",
  },
});
