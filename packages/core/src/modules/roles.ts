import { z } from "zod";
import { ALL_PERMISSIONS, isPermissionKey } from "../auth/permissions";
import { requirePermission, type ServiceContext } from "../context";
import { AppError, conflict, notFound } from "../errors";
import { audit } from "../platform/audit";
import { optionalText, parse, requiredText } from "../validation";

export const roleSchema = z.object({
  code: z.string().trim().toUpperCase().min(2).max(40).regex(/^[A-Z0-9_]+$/),
  nameAr: requiredText(100),
  nameEn: requiredText(100),
  description: optionalText(500),
  dataScope: z.enum(["ALL", "SHOWROOM", "OWN"]),
  permissions: z.array(z.string()).refine((arr) => arr.every(isPermissionKey), "unknown permission"),
});

const roleInclude = {
  permissions: { select: { permission: { select: { key: true } } } },
  _count: { select: { users: true } },
} as const;

function shape<T extends { permissions: { permission: { key: string } }[] }>(role: T) {
  return { ...role, permissions: role.permissions.map((p) => p.permission.key) };
}

export async function listRoles(ctx: ServiceContext) {
  requirePermission(ctx, "roles.view");
  const roles = await ctx.db.role.findMany({ where: { deletedAt: null }, include: roleInclude, orderBy: { createdAt: "asc" } });
  return roles.map(shape);
}

export async function getRole(ctx: ServiceContext, id: string) {
  requirePermission(ctx, "roles.view");
  const role = await ctx.db.role.findFirst({ where: { id, deletedAt: null }, include: roleInclude });
  if (!role) throw notFound("role");
  return shape(role);
}

export function listPermissionCatalog() {
  return ALL_PERMISSIONS;
}

async function permissionIds(ctx: ServiceContext, keys: string[]) {
  const perms = await ctx.db.permission.findMany({ where: { key: { in: keys } }, select: { id: true } });
  return perms.map((p) => p.id);
}

export async function createRole(ctx: ServiceContext, input: unknown) {
  requirePermission(ctx, "roles.create");
  const data = parse(roleSchema, input);
  if (await ctx.db.role.findUnique({ where: { code: data.code } })) throw conflict("errors.duplicate", { field: "code" });
  const ids = await permissionIds(ctx, data.permissions);
  return ctx.db.$transaction(async (tx) => {
    const role = await tx.role.create({
      data: {
        code: data.code,
        nameAr: data.nameAr,
        nameEn: data.nameEn,
        description: data.description,
        dataScope: data.dataScope,
        createdById: ctx.actor.userId,
        permissions: { create: ids.map((permissionId) => ({ permissionId })) },
      },
      include: roleInclude,
    });
    await audit(tx, ctx, { action: "role.create", entityType: "role", entityId: role.id, entityNumber: role.code, newValues: data });
    return shape(role);
  });
}

export async function updateRole(ctx: ServiceContext, id: string, input: unknown) {
  requirePermission(ctx, "roles.edit");
  const data = parse(roleSchema.omit({ code: true }).partial(), input);
  const before = await ctx.db.role.findFirst({ where: { id, deletedAt: null }, include: roleInclude });
  if (!before) throw notFound("role");
  // Super admin always holds every permission implicitly; editing it is meaningless and risky.
  if (before.code === "SUPER_ADMIN") throw new AppError("CONFLICT", "errors.systemRoleLocked");
  const ids = data.permissions ? await permissionIds(ctx, data.permissions) : null;
  return ctx.db.$transaction(async (tx) => {
    const { permissions, ...fields } = data;
    const role = await tx.role.update({
      where: { id },
      data: {
        ...fields,
        updatedById: ctx.actor.userId,
        ...(ids ? { permissions: { deleteMany: {}, create: ids.map((permissionId) => ({ permissionId })) } } : {}),
      },
      include: roleInclude,
    });
    const beforeShape = shape(before);
    await audit(tx, ctx, {
      action: "role.update",
      entityType: "role",
      entityId: id,
      entityNumber: before.code,
      oldValues: {
        nameAr: before.nameAr,
        nameEn: before.nameEn,
        dataScope: before.dataScope,
        permissions: permissions ? beforeShape.permissions : undefined,
      },
      newValues: data,
    });
    // Holders of this role must re-authenticate to pick up the new permission set.
    if (ids) {
      await tx.userSession.updateMany({ where: { revokedAt: null, user: { roles: { some: { roleId: id } } } }, data: { revokedAt: new Date() } });
    }
    return shape(role);
  });
}

export async function deleteRole(ctx: ServiceContext, id: string) {
  requirePermission(ctx, "roles.delete");
  const role = await ctx.db.role.findFirst({ where: { id, deletedAt: null }, include: { _count: { select: { users: true } } } });
  if (!role) throw notFound("role");
  if (role.isSystem) throw new AppError("CONFLICT", "errors.systemRoleLocked");
  if (role._count.users > 0) throw new AppError("CONFLICT", "errors.roleInUse");
  await ctx.db.$transaction(async (tx) => {
    await tx.role.update({ where: { id }, data: { deletedAt: new Date(), status: "INACTIVE", updatedById: ctx.actor.userId } });
    await audit(tx, ctx, { action: "role.delete", entityType: "role", entityId: id, entityNumber: role.code });
  });
}
