import type { Db } from "@edge/db";
import type { DataScopeValue, PermissionKey } from "./auth/permissions";
import { AppError, forbidden } from "./errors";

/** The authenticated principal, resolved server-side from the session on every request. */
export interface Actor {
  userId: string;
  username: string;
  fullName: string;
  locale: "ar" | "en";
  showroomId: string | null;
  /** Broadest scope among the user's roles. */
  dataScope: DataScopeValue;
  permissions: ReadonlySet<string>;
  /** Warehouses explicitly assigned; empty = not restricted by assignment. */
  warehouseIds: readonly string[];
  isSuperAdmin: boolean;
}

export interface RequestMeta {
  ip?: string | null;
  userAgent?: string | null;
}

/** Everything a service needs: DB handle + who is calling. Services never read HTTP objects. */
export interface ServiceContext {
  db: Db;
  actor: Actor;
  meta: RequestMeta;
}

export function can(actor: Actor, permission: PermissionKey): boolean {
  return actor.isSuperAdmin || actor.permissions.has(permission);
}

export function requirePermission(ctx: ServiceContext, ...permissions: PermissionKey[]): void {
  for (const p of permissions) if (!can(ctx.actor, p)) throw forbidden(p);
}

export function requireAnyPermission(ctx: ServiceContext, ...permissions: PermissionKey[]): void {
  if (!permissions.some((p) => can(ctx.actor, p))) throw forbidden(permissions.join("|"));
}

/**
 * Row filter for showroom-scoped documents (customers, quotations, sales orders, invoices ...).
 * ALL      → no filter
 * SHOWROOM → records of the user's showroom
 * OWN      → records the user created (or is salesperson of) within the showroom
 */
export function showroomScopeWhere(
  actor: Actor,
  opts: { showroomField?: string; ownerFields?: string[] } = {},
): Record<string, unknown> {
  const showroomField = opts.showroomField ?? "showroomId";
  const ownerFields = opts.ownerFields ?? ["createdById"];
  if (actor.isSuperAdmin || actor.dataScope === "ALL") return {};
  if (!actor.showroomId && actor.dataScope === "SHOWROOM") {
    // Mis-configured user: showroom scope without a showroom sees nothing.
    return { id: { in: [] } };
  }
  if (actor.dataScope === "SHOWROOM") return { [showroomField]: actor.showroomId };
  return { OR: ownerFields.map((f) => ({ [f]: actor.userId })) };
}

/** Throws if a single record falls outside the actor's scope. */
export function assertInShowroomScope(
  actor: Actor,
  record: { showroomId?: string | null; createdById?: string | null; salespersonId?: string | null },
): void {
  if (actor.isSuperAdmin || actor.dataScope === "ALL") return;
  if (actor.dataScope === "SHOWROOM" && record.showroomId && record.showroomId === actor.showroomId) return;
  if (actor.dataScope === "OWN" && (record.createdById === actor.userId || record.salespersonId === actor.userId)) return;
  throw new AppError("NOT_FOUND", "errors.notFound");
}

export function assertWarehouseAccess(actor: Actor, warehouseId: string): void {
  if (actor.isSuperAdmin || actor.warehouseIds.length === 0) return;
  if (!actor.warehouseIds.includes(warehouseId)) throw forbidden("warehouse");
}
