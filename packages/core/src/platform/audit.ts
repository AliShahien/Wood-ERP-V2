import type { Prisma, Tx } from "@edge/db";
import type { ServiceContext } from "../context";

export interface AuditEntry {
  action: string;
  entityType: string;
  entityId?: string | null;
  entityNumber?: string | null;
  oldValues?: unknown;
  newValues?: unknown;
}

const SECRET_FIELDS = new Set(["passwordHash", "password", "tokenHash", "token", "secret"]);

function sanitize(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  return JSON.parse(
    JSON.stringify(value, (key, v) => {
      if (SECRET_FIELDS.has(key)) return undefined;
      if (typeof v === "bigint") return v.toString();
      return v;
    }),
  );
}

/** Returns only the keys whose values changed — keeps audit rows small and readable. */
export function diff<T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>,
): { oldValues: Partial<T>; newValues: Partial<T> } | null {
  const oldValues: Partial<T> = {};
  const newValues: Partial<T> = {};
  for (const key of Object.keys(after) as (keyof T)[]) {
    const a = before[key];
    const b = after[key];
    if (b === undefined) continue;
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      oldValues[key] = a;
      newValues[key] = b as T[keyof T];
    }
  }
  return Object.keys(newValues).length ? { oldValues, newValues } : null;
}

/** Writes an audit row. Pass the transaction client so the audit commits atomically with the change. */
export async function audit(tx: Tx, ctx: Pick<ServiceContext, "actor" | "meta">, entry: AuditEntry): Promise<void> {
  await tx.auditLog.create({
    data: {
      userId: ctx.actor.userId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      entityNumber: entry.entityNumber ?? null,
      oldValues: sanitize(entry.oldValues),
      newValues: sanitize(entry.newValues),
      ip: ctx.meta.ip ?? null,
      userAgent: ctx.meta.userAgent?.slice(0, 500) ?? null,
    },
  });
}
