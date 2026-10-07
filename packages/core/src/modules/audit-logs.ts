import { z } from "zod";
import { requirePermission, type ServiceContext } from "../context";
import { listQuerySchema, pageArgs, toPage } from "../platform/pagination";
import { parse, uuid } from "../validation";

export const auditListSchema = listQuerySchema.extend({
  entityType: z.string().max(50).optional(),
  entityId: z.string().max(64).optional(),
  userId: uuid.optional(),
  action: z.string().max(80).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

/** Read-only. There is intentionally no update/delete API; the DB trigger blocks it too. */
export async function listAuditLogs(ctx: ServiceContext, input: unknown) {
  requirePermission(ctx, "audit_logs.view");
  const q = parse(auditListSchema, input);
  const where = {
    ...(q.entityType ? { entityType: q.entityType } : {}),
    ...(q.entityId ? { entityId: q.entityId } : {}),
    ...(q.userId ? { userId: q.userId } : {}),
    ...(q.action ? { action: { startsWith: q.action } } : {}),
    ...(q.from || q.to ? { createdAt: { ...(q.from ? { gte: q.from } : {}), ...(q.to ? { lte: q.to } : {}) } } : {}),
    ...(q.q ? { OR: [{ entityNumber: { contains: q.q, mode: "insensitive" as const } }, { action: { contains: q.q } }] } : {}),
  };
  const [rows, total] = await Promise.all([
    ctx.db.auditLog.findMany({
      where,
      orderBy: { id: "desc" },
      include: { user: { select: { id: true, fullName: true, username: true } } },
      ...pageArgs(q),
    }),
    ctx.db.auditLog.count({ where }),
  ]);
  return toPage(rows.map((r) => ({ ...r, id: r.id.toString() })), total, q);
}
