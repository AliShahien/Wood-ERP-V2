import { z } from "zod";
import { hashPassword, assertPasswordPolicy, verifyPassword } from "../auth/password";
import { requirePermission, type ServiceContext } from "../context";
import { AppError, conflict, notFound } from "../errors";
import { audit, diff } from "../platform/audit";
import { nextNumber } from "../platform/numbering";
import { listQuerySchema, orderBy, pageArgs, toPage, type ListQuery } from "../platform/pagination";
import { email, optionalText, parse, phone, recordStatus, requiredText, uuid } from "../validation";

const userSelect = {
  id: true,
  code: true,
  fullName: true,
  username: true,
  email: true,
  phone: true,
  department: true,
  showroomId: true,
  locale: true,
  status: true,
  lastLoginAt: true,
  mustChangePassword: true,
  createdAt: true,
  showroom: { select: { id: true, code: true, name: true } },
  roles: { select: { role: { select: { id: true, code: true, nameAr: true, nameEn: true } } } },
  warehouses: { select: { warehouse: { select: { id: true, code: true, name: true } } } },
} as const;

const username = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(50)
  .regex(/^[a-z0-9._-]+$/);

export const createUserSchema = z.object({
  fullName: requiredText(150),
  username,
  email,
  phone,
  department: optionalText(100),
  showroomId: uuid.nullable().optional(),
  locale: z.enum(["ar", "en"]).default("ar"),
  password: z.string().min(8).max(128),
  roleIds: z.array(uuid).min(1),
  warehouseIds: z.array(uuid).default([]),
  mustChangePassword: z.boolean().default(true),
});

export const updateUserSchema = createUserSchema
  .omit({ password: true, username: true, mustChangePassword: true })
  .partial()
  .extend({ status: recordStatus.optional() });

export const usersListSchema = listQuerySchema.extend({
  status: recordStatus.optional(),
  showroomId: uuid.optional(),
  roleId: uuid.optional(),
});

export async function listUsers(ctx: ServiceContext, input: unknown) {
  requirePermission(ctx, "users.view");
  const q = parse(usersListSchema, input);
  const where = {
    deletedAt: null,
    ...(q.status ? { status: q.status } : {}),
    ...(q.showroomId ? { showroomId: q.showroomId } : {}),
    ...(q.roleId ? { roles: { some: { roleId: q.roleId } } } : {}),
    ...(q.q
      ? {
          OR: [
            { fullName: { contains: q.q, mode: "insensitive" as const } },
            { username: { contains: q.q, mode: "insensitive" as const } },
            { email: { contains: q.q, mode: "insensitive" as const } },
            { phone: { contains: q.q } },
            { code: { contains: q.q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };
  const [items, total] = await Promise.all([
    ctx.db.user.findMany({ where, select: userSelect, orderBy: orderBy(q, ["fullName", "username", "createdAt", "lastLoginAt"], "createdAt"), ...pageArgs(q) }),
    ctx.db.user.count({ where }),
  ]);
  return toPage(items, total, q as ListQuery);
}

export async function getUser(ctx: ServiceContext, id: string) {
  requirePermission(ctx, "users.view");
  const user = await ctx.db.user.findFirst({ where: { id, deletedAt: null }, select: userSelect });
  if (!user) throw notFound("user");
  return user;
}

async function assertRolesAssignable(ctx: ServiceContext, roleIds: string[]) {
  const roles = await ctx.db.role.findMany({ where: { id: { in: roleIds }, deletedAt: null }, select: { id: true, code: true } });
  if (roles.length !== new Set(roleIds).size) throw new AppError("VALIDATION", "errors.validation", [{ path: "roleIds", code: "invalid" }]);
  // Only a super admin can grant super admin.
  if (roles.some((r) => r.code === "SUPER_ADMIN") && !ctx.actor.isSuperAdmin) throw new AppError("FORBIDDEN", "errors.forbidden");
}

export async function createUser(ctx: ServiceContext, input: unknown) {
  requirePermission(ctx, "users.create");
  const data = parse(createUserSchema, input);
  assertPasswordPolicy(data.password);
  await assertRolesAssignable(ctx, data.roleIds);
  const exists = await ctx.db.user.findFirst({
    where: { OR: [{ username: data.username }, ...(data.email ? [{ email: data.email }] : [])] },
    select: { id: true },
  });
  if (exists) throw conflict("errors.userExists");
  const passwordHash = await hashPassword(data.password);

  return ctx.db.$transaction(async (tx) => {
    const code = await nextNumber(tx, "USER");
    const user = await tx.user.create({
      data: {
        code,
        fullName: data.fullName,
        username: data.username,
        email: data.email ?? null,
        phone: data.phone ?? null,
        department: data.department,
        showroomId: data.showroomId ?? null,
        locale: data.locale,
        passwordHash,
        mustChangePassword: data.mustChangePassword,
        passwordChangedAt: new Date(),
        createdById: ctx.actor.userId,
        roles: { create: data.roleIds.map((roleId) => ({ roleId })) },
        warehouses: { create: data.warehouseIds.map((warehouseId) => ({ warehouseId })) },
      },
      select: userSelect,
    });
    await audit(tx, ctx, {
      action: "user.create",
      entityType: "user",
      entityId: user.id,
      entityNumber: user.code,
      newValues: { fullName: user.fullName, username: user.username, roleIds: data.roleIds, showroomId: user.showroomId },
    });
    return user;
  });
}

export async function updateUser(ctx: ServiceContext, id: string, input: unknown) {
  requirePermission(ctx, "users.edit");
  const data = parse(updateUserSchema, input);
  const before = await ctx.db.user.findFirst({
    where: { id, deletedAt: null },
    include: { roles: true, warehouses: true },
  });
  if (!before) throw notFound("user");
  if (data.status && data.status !== before.status) requirePermission(ctx, "users.deactivate");
  if (data.status === "INACTIVE" && id === ctx.actor.userId) throw new AppError("CONFLICT", "errors.cannotDeactivateSelf");
  if (data.roleIds) await assertRolesAssignable(ctx, data.roleIds);
  const beforeIsSuper = await ctx.db.userRole.count({ where: { userId: id, role: { code: "SUPER_ADMIN" } } });
  if (beforeIsSuper && !ctx.actor.isSuperAdmin) throw new AppError("FORBIDDEN", "errors.forbidden");

  return ctx.db.$transaction(async (tx) => {
    const { roleIds, warehouseIds, ...fields } = data;
    const updated = await tx.user.update({
      where: { id },
      data: {
        ...fields,
        updatedById: ctx.actor.userId,
        ...(roleIds ? { roles: { deleteMany: {}, create: roleIds.map((roleId) => ({ roleId })) } } : {}),
        ...(warehouseIds ? { warehouses: { deleteMany: {}, create: warehouseIds.map((warehouseId) => ({ warehouseId })) } } : {}),
      },
      select: userSelect,
    });
    const changes = diff(
      { ...before, roleIds: before.roles.map((r) => r.roleId).sort(), warehouseIds: before.warehouses.map((w) => w.warehouseId).sort() } as Record<string, unknown>,
      { ...fields, roleIds: roleIds?.slice().sort(), warehouseIds: warehouseIds?.slice().sort() },
    );
    if (changes) await audit(tx, ctx, { action: "user.update", entityType: "user", entityId: id, entityNumber: before.code, ...changes });
    // Permission changes take effect immediately: force re-login.
    if (data.status === "INACTIVE" || roleIds) {
      await tx.userSession.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    }
    return updated;
  });
}

export const resetPasswordSchema = z.object({ newPassword: z.string().min(8).max(128) });

/** Admin reset: user must change it on next login; all sessions are revoked. */
export async function resetPassword(ctx: ServiceContext, id: string, input: unknown) {
  requirePermission(ctx, "users.reset_password");
  const { newPassword } = parse(resetPasswordSchema, input);
  assertPasswordPolicy(newPassword);
  const user = await ctx.db.user.findFirst({ where: { id, deletedAt: null }, select: { id: true, code: true } });
  if (!user) throw notFound("user");
  const isSuper = await ctx.db.userRole.count({ where: { userId: id, role: { code: "SUPER_ADMIN" } } });
  if (isSuper && !ctx.actor.isSuperAdmin) throw new AppError("FORBIDDEN", "errors.forbidden");
  const passwordHash = await hashPassword(newPassword);
  await ctx.db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id },
      data: { passwordHash, mustChangePassword: true, passwordChangedAt: new Date(), failedLoginCount: 0, lockedUntil: null, updatedById: ctx.actor.userId },
    });
    await tx.userSession.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    await audit(tx, ctx, { action: "user.reset_password", entityType: "user", entityId: id, entityNumber: user.code });
  });
}

export const changePasswordSchema = z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(8).max(128) });

/** Self-service. Keeps the current session, revokes the others. */
export async function changeOwnPassword(ctx: ServiceContext, input: unknown, currentTokenHash?: string) {
  const { currentPassword, newPassword } = parse(changePasswordSchema, input);
  assertPasswordPolicy(newPassword);
  const user = await ctx.db.user.findUniqueOrThrow({ where: { id: ctx.actor.userId } });
  if (!(await verifyPassword(user.passwordHash, currentPassword))) throw new AppError("VALIDATION", "errors.currentPasswordWrong");
  if (currentPassword === newPassword) throw new AppError("VALIDATION", "errors.passwordSame");
  const passwordHash = await hashPassword(newPassword);
  await ctx.db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { passwordHash, mustChangePassword: false, passwordChangedAt: new Date() } });
    await tx.userSession.updateMany({
      where: { userId: user.id, revokedAt: null, ...(currentTokenHash ? { NOT: { tokenHash: currentTokenHash } } : {}) },
      data: { revokedAt: new Date() },
    });
    await audit(tx, ctx, { action: "user.change_password", entityType: "user", entityId: user.id, entityNumber: user.code });
  });
}

export const profileSchema = z.object({
  fullName: requiredText(150).optional(),
  phone,
  locale: z.enum(["ar", "en"]).optional(),
});

export async function updateOwnProfile(ctx: ServiceContext, input: unknown) {
  const data = parse(profileSchema, input);
  return ctx.db.user.update({
    where: { id: ctx.actor.userId },
    data: { ...data, updatedById: ctx.actor.userId },
    select: { id: true, fullName: true, phone: true, locale: true },
  });
}

export async function getLoginHistory(ctx: ServiceContext, userId: string, input: unknown) {
  if (userId !== ctx.actor.userId) requirePermission(ctx, "users.view");
  const q = parse(listQuerySchema, input);
  const where = { userId };
  const [items, total] = await Promise.all([
    ctx.db.loginHistory.findMany({ where, orderBy: { createdAt: "desc" }, ...pageArgs(q) }),
    ctx.db.loginHistory.count({ where }),
  ]);
  return toPage(items, total, q);
}
