import { createDb, type Db } from "@edge/db";
import { loadActor } from "../src/auth/session";
import type { ServiceContext } from "../src/context";

let db: Db | null = null;
export function testDb(): Db {
  db ??= createDb(process.env.DATABASE_URL);
  return db;
}

export async function adminCtx(): Promise<ServiceContext> {
  const d = testDb();
  const admin = await d.user.findUniqueOrThrow({ where: { username: "admin" } });
  const actor = await loadActor(d, admin.id);
  if (!actor) throw new Error("admin actor missing");
  return { db: d, actor, meta: { ip: "127.0.0.1", userAgent: "vitest" } };
}

export async function ctxFor(userId: string): Promise<ServiceContext> {
  const d = testDb();
  const actor = await loadActor(d, userId);
  if (!actor) throw new Error("actor missing");
  return { db: d, actor, meta: { ip: "127.0.0.1", userAgent: "vitest" } };
}

export const uniq = () => Math.random().toString(36).slice(2, 8);
