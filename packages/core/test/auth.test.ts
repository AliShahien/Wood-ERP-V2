import { describe, expect, it } from "vitest";
import { login, logout, resolveSession } from "../src/auth/session";
import { can, showroomScopeWhere } from "../src/context";
import * as users from "../src/modules/users";
import * as roles from "../src/modules/roles";
import { adminCtx, ctxFor, testDb, uniq } from "./helpers";

const meta = { ip: "127.0.0.1", userAgent: "vitest" };

describe("authentication", () => {
  it("logs in, resolves and revokes a session", async () => {
    const db = testDb();
    const res = await login(db, "admin", "Admin@12345", meta);
    const session = await resolveSession(db, res.token);
    expect(session?.actor.username).toBe("admin");
    expect(session?.actor.isSuperAdmin).toBe(true);
    await logout(db, res.token);
    expect(await resolveSession(db, res.token)).toBeNull();
  });

  it("rejects bad passwords, records history, and locks after 5 failures", async () => {
    const ctx = await adminCtx();
    const role = await ctx.db.role.findUniqueOrThrow({ where: { code: "SHOWROOM_EMPLOYEE" } });
    const u = await users.createUser(ctx, {
      fullName: "Lock Test", username: `lock${uniq()}`, password: "Passw0rd!", roleIds: [role.id], mustChangePassword: false,
    });
    for (let i = 0; i < 5; i++) {
      await expect(login(ctx.db, u.username, "wrong-pass1", meta)).rejects.toMatchObject({ messageKey: "errors.invalidCredentials" });
    }
    await expect(login(ctx.db, u.username, "Passw0rd!", meta)).rejects.toMatchObject({ messageKey: "errors.accountLocked" });
    const history = await ctx.db.loginHistory.count({ where: { userId: u.id, success: false } });
    expect(history).toBe(6);
  });

  it("stores only an Argon2id hash, never the plain password", async () => {
    const ctx = await adminCtx();
    const role = await ctx.db.role.findUniqueOrThrow({ where: { code: "ACCOUNTANT" } });
    const u = await users.createUser(ctx, { fullName: "Hash Test", username: `hash${uniq()}`, password: "S3cretPass", roleIds: [role.id] });
    const row = await ctx.db.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(row.passwordHash.startsWith("$argon2id$")).toBe(true);
    expect(row.passwordHash).not.toContain("S3cretPass");
  });

  it("deactivating a user kills their sessions", async () => {
    const ctx = await adminCtx();
    const role = await ctx.db.role.findUniqueOrThrow({ where: { code: "ACCOUNTANT" } });
    const u = await users.createUser(ctx, { fullName: "Deact", username: `deact${uniq()}`, password: "Passw0rd1", roleIds: [role.id] });
    const { token } = await login(ctx.db, u.username, "Passw0rd1", meta);
    await users.updateUser(ctx, u.id, { status: "INACTIVE" });
    expect(await resolveSession(ctx.db, token)).toBeNull();
    await expect(login(ctx.db, u.username, "Passw0rd1", meta)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });
});

describe("authorization", () => {
  it("custom role grants exactly its permissions; services enforce them", async () => {
    const ctx = await adminCtx();
    const role = await roles.createRole(ctx, {
      code: `VIEWER_${uniq().toUpperCase()}`, nameAr: "مشاهد", nameEn: "Viewer", dataScope: "ALL", permissions: ["users.view"],
    });
    const u = await users.createUser(ctx, { fullName: "Viewer", username: `viewer${uniq()}`, password: "Passw0rd1", roleIds: [role.id] });
    const vctx = await ctxFor(u.id);
    expect(can(vctx.actor, "users.view")).toBe(true);
    expect(can(vctx.actor, "users.create")).toBe(false);
    await expect(users.listUsers(vctx, {})).resolves.toHaveProperty("items");
    await expect(
      users.createUser(vctx, { fullName: "X", username: `x${uniq()}`, password: "Passw0rd1", roleIds: [role.id] }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("non-super-admins cannot grant the super admin role", async () => {
    const ctx = await adminCtx();
    const mgr = await ctx.db.role.findUniqueOrThrow({ where: { code: "MANAGEMENT" } });
    const sa = await ctx.db.role.findUniqueOrThrow({ where: { code: "SUPER_ADMIN" } });
    const creatorRole = await roles.createRole(ctx, {
      code: `HR_${uniq().toUpperCase()}`, nameAr: "موارد", nameEn: "HR", dataScope: "ALL", permissions: ["users.view", "users.create"],
    });
    const hr = await users.createUser(ctx, { fullName: "HR", username: `hr${uniq()}`, password: "Passw0rd1", roleIds: [creatorRole.id] });
    const hctx = await ctxFor(hr.id);
    await expect(
      users.createUser(hctx, { fullName: "Evil", username: `evil${uniq()}`, password: "Passw0rd1", roleIds: [sa.id] }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      users.createUser(hctx, { fullName: "Ok", username: `ok${uniq()}`, password: "Passw0rd1", roleIds: [mgr.id] }),
    ).resolves.toHaveProperty("id");
  });

  it("builds showroom data-scope filters", async () => {
    const base = { userId: "u1", username: "u", fullName: "U", locale: "ar" as const, permissions: new Set<string>(), warehouseIds: [], isSuperAdmin: false };
    expect(showroomScopeWhere({ ...base, showroomId: "s1", dataScope: "ALL" })).toEqual({});
    expect(showroomScopeWhere({ ...base, showroomId: "s1", dataScope: "SHOWROOM" })).toEqual({ showroomId: "s1" });
    expect(showroomScopeWhere({ ...base, showroomId: "s1", dataScope: "OWN" })).toEqual({ OR: [{ createdById: "u1" }] });
    expect(showroomScopeWhere({ ...base, showroomId: null, dataScope: "SHOWROOM" })).toEqual({ id: { in: [] } });
  });

  it("writes an audit trail for user changes", async () => {
    const ctx = await adminCtx();
    const role = await ctx.db.role.findUniqueOrThrow({ where: { code: "ACCOUNTANT" } });
    const u = await users.createUser(ctx, { fullName: "Audit Me", username: `aud${uniq()}`, password: "Passw0rd1", roleIds: [role.id] });
    await users.updateUser(ctx, u.id, { fullName: "Audit Me 2" });
    const logs = await ctx.db.auditLog.findMany({ where: { entityType: "user", entityId: u.id }, orderBy: { id: "asc" } });
    expect(logs.map((l) => l.action)).toEqual(["user.create", "user.update"]);
    expect(logs[1]?.oldValues).toMatchObject({ fullName: "Audit Me" });
    expect(logs[1]?.newValues).toMatchObject({ fullName: "Audit Me 2" });
    expect(JSON.stringify(logs.map((l) => [l.oldValues, l.newValues]))).not.toContain("passwordHash");
  });
});
