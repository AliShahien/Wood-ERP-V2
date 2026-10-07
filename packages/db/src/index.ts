import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";

export * from "./generated/prisma/client";
export { Prisma } from "./generated/prisma/client";

export type Db = InstanceType<typeof PrismaClient>;
/** Client usable inside `$transaction(async (tx) => ...)`. */
export type Tx = Omit<Db, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

export function createDb(connectionString = process.env.DATABASE_URL): Db {
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  const adapter = new PrismaPg({
    connectionString,
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
