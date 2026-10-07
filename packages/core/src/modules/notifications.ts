import { z } from "zod";
import type { Db, Tx } from "@edge/db";
import type { PermissionKey } from "../auth/permissions";
import type { ServiceContext } from "../context";
import { listQuerySchema, pageArgs, toPage } from "../platform/pagination";
import { parse, uuid } from "../validation";

export type NotificationType =
  | "low_stock" | "quotation_pending" | "manufacturing_delayed" | "qc_failed" | "payment_overdue"
  | "supplier_payment_due" | "purchase_pending" | "new_sales_order" | "waiting_materials";

/** Where a notification links to in the UI. */
export const ENTITY_PATHS: Record<string, string> = {
  quotation: "/quotations", sales_order: "/sales-orders", manufacturing_order: "/manufacturing", material: "/materials",
  invoice: "/invoices", supplier_invoice: "/supplier-invoices", purchase_order: "/purchase-orders",
};

/** Active users who effectively hold `permission` (including super admins). */
async function recipients(db: Pick<Db, "user">, permission: PermissionKey, showroomId?: string | null) {
  const users = await db.user.findMany({
    where: {
      deletedAt: null, status: "ACTIVE",
      roles: { some: { role: { status: "ACTIVE", deletedAt: null, OR: [{ code: "SUPER_ADMIN" }, { permissions: { some: { permission: { key: permission } } } }] } } },
    },
    select: { id: true, showroomId: true, roles: { select: { role: { select: { code: true, dataScope: true } } } } },
  });
  // Showroom-scoped users only hear about their own showroom's documents.
  return users.filter((u) => {
    if (!showroomId) return true;
    const broad = u.roles.some((r) => r.role.code === "SUPER_ADMIN" || r.role.dataScope === "ALL");
    return broad || u.showroomId === showroomId;
  }).map((u) => u.id);
}

/**
 * Creates one notification per permitted recipient. `dedupeKey` makes it idempotent
 * (scheduled checks can run every few minutes without spamming).
 */
export async function notify(
  db: Pick<Db, "user" | "notification"> | Pick<Tx, "user" | "notification">,
  n: { type: NotificationType; permission: PermissionKey; params?: Record<string, string | number>; entityType?: string; entityId?: string; dedupeKey?: string; showroomId?: string | null; excludeUserId?: string },
) {
  const users = (await recipients(db as Pick<Db, "user">, n.permission, n.showroomId)).filter((id) => id !== n.excludeUserId);
  if (!users.length) return 0;
  const res = await (db as Pick<Db, "notification">).notification.createMany({
    data: users.map((userId) => ({ userId, type: n.type, params: n.params ?? {}, entityType: n.entityType ?? null, entityId: n.entityId ?? null, dedupeKey: n.dedupeKey ?? null })),
    skipDuplicates: true,
  });
  return res.count;
}

export async function listMyNotifications(ctx: ServiceContext, input: unknown) {
  const q = parse(listQuerySchema.extend({ unread: z.enum(["1"]).optional() }), input);
  const where = { userId: ctx.actor.userId, ...(q.unread ? { readAt: null } : {}) };
  const [items, total, unread] = await Promise.all([
    ctx.db.notification.findMany({ where, orderBy: { createdAt: "desc" }, ...pageArgs(q) }),
    ctx.db.notification.count({ where }),
    ctx.db.notification.count({ where: { userId: ctx.actor.userId, readAt: null } }),
  ]);
  return { ...toPage(items.map((i) => ({ ...i, href: i.entityType && i.entityId && ENTITY_PATHS[i.entityType] ? `${ENTITY_PATHS[i.entityType]}/${i.entityId}` : null })), total, q), unread };
}

export async function unreadCount(ctx: ServiceContext) {
  return ctx.db.notification.count({ where: { userId: ctx.actor.userId, readAt: null } });
}

export async function markRead(ctx: ServiceContext, input: unknown) {
  const { ids, all } = parse(z.object({ ids: z.array(uuid).max(200).optional(), all: z.boolean().optional() }), input);
  const res = await ctx.db.notification.updateMany({
    where: { userId: ctx.actor.userId, readAt: null, ...(all ? {} : { id: { in: ids ?? [] } }) },
    data: { readAt: new Date() },
  });
  return { updated: res.count };
}
