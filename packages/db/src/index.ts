import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";

// Vercel reserves the TZ environment key. Apply the business timezone inside
// the server process before any document or dashboard dates are calculated.
if (process.env.APP_TIMEZONE) process.env.TZ = process.env.APP_TIMEZONE;

export * from "./generated/prisma/client";
export { Prisma } from "./generated/prisma/client";

export type Db = InstanceType<typeof PrismaClient>;
/** Client usable inside `$transaction(async (tx) => ...)`. */
export type Tx = Omit<Db, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

export function createDb(connectionString = process.env.DATABASE_URL): Db {
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  // Verify the Supabase pooler certificate with its published root CA.
  const ca = process.env.SUPABASE_DB_CA_CERT?.replace(/\\n/g, "\n");
  const adapter = new PrismaPg({
    connectionString,
    ...(ca ? { ssl: { ca, rejectUnauthorized: true } } : {}),
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
    idleTimeoutMillis: 30_000,
  });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

// One client per process (survives Next.js dev hot reloads).
const globalForDb = globalThis as unknown as { __edgeDb?: Db };

export function getDb(): Db {
  if (!globalForDb.__edgeDb) globalForDb.__edgeDb = createDb();
  return globalForDb.__edgeDb;
}
