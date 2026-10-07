import { createHmac, randomBytes } from "node:crypto";
import type { Db } from "@edge/db";
import type { Actor, RequestMeta } from "../context";
import { AppError } from "../errors";
import type { DataScopeValue } from "./permissions";
import { getDummyHash, verifyPassword } from "./password";

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw new Error("AUTH_SECRET must be set (>= 32 chars)");
  return s;
}

/** Only the HMAC of the token is stored; a DB leak does not yield usable session tokens. */
export function hashToken(token: string): string {
  return createHmac("sha256", secret()).update(token).digest("hex");
}

function ttlMs(): number {
  return Number(process.env.SESSION_TTL_HOURS ?? 12) * 3600 * 1000;
}

export interface LoginResult {
  token: string;
  expiresAt: Date;
  userId: string;
  locale: "ar" | "en";
  mustChangePassword: boolean;
}

export async function login(db: Db, username: string, password: string, meta: RequestMeta): Promise<LoginResult> {
  const normalized = username.trim().toLowerCase();
  const user = await db.user.findFirst({
    where: { deletedAt: null, OR: [{ username: normalized }, { email: normalized }] },
  });

  const fail = async (reason: string, userId?: string) => {
    await db.loginHistory.create({
      data: { userId: userId ?? null, username: normalized, success: false, reason, ip: meta.ip, userAgent: meta.userAgent?.slice(0, 500) },
    });
    return new AppError("UNAUTHENTICATED", "errors.invalidCredentials");
  };

  if (!user) {
    await verifyPassword(await getDummyHash(), password); // constant-ish timing
    throw await fail("unknown_user");
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    await db.loginHistory.create({
      data: { userId: user.id, username: normalized, success: false, reason: "locked", ip: meta.ip, userAgent: meta.userAgent?.slice(0, 500) },
    });
    throw new AppError("UNAUTHENTICATED", "errors.accountLocked");
  }
  const ok = await verifyPassword(user.passwordHash, password);
  if (!ok) {
    const failed = user.failedLoginCount + 1;
    await db.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: failed >= MAX_FAILED_ATTEMPTS ? 0 : failed,
        lockedUntil: failed >= MAX_FAILED_ATTEMPTS ? new Date(Date.now() + LOCK_MINUTES * 60_000) : undefined,
      },
    });
    throw await fail("bad_password", user.id);
  }
  if (user.status !== "ACTIVE") throw await fail("inactive", user.id);

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + ttlMs());
  await db.$transaction([
    db.userSession.create({
      data: { userId: user.id, tokenHash: hashToken(token), expiresAt, ip: meta.ip, userAgent: meta.userAgent?.slice(0, 500) },
    }),
    db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date(), failedLoginCount: 0, lockedUntil: null } }),
    db.loginHistory.create({
      data: { userId: user.id, username: normalized, success: true, ip: meta.ip, userAgent: meta.userAgent?.slice(0, 500) },
    }),
  ]);
  return { token, expiresAt, userId: user.id, locale: user.locale, mustChangePassword: user.mustChangePassword };
}

export async function logout(db: Db, token: string): Promise<void> {
  await db.userSession.updateMany({ where: { tokenHash: hashToken(token), revokedAt: null }, data: { revokedAt: new Date() } });
}

export async function revokeAllSessions(db: Db, userId: string, exceptTokenHash?: string): Promise<void> {
  await db.userSession.updateMany({
    where: { userId, revokedAt: null, ...(exceptTokenHash ? { NOT: { tokenHash: exceptTokenHash } } : {}) },
    data: { revokedAt: new Date() },
  });
}

const SCOPE_RANK: Record<DataScopeValue, number> = { OWN: 0, SHOWROOM: 1, ALL: 2 };

/** Loads the actor (user + effective permissions) for a user id. */
export async function loadActor(db: Db, userId: string): Promise<Actor | null> {
  const user = await db.user.findFirst({
    where: { id: userId, deletedAt: null, status: "ACTIVE" },
    include: {
      roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
      warehouses: { select: { warehouseId: true } },
    },
  });
  if (!user) return null;
  const permissions = new Set<string>();
  let scope: DataScopeValue = "OWN";
  let isSuperAdmin = false;
  for (const { role } of user.roles) {
    if (role.deletedAt || role.status !== "ACTIVE") continue;
    if (role.code === "SUPER_ADMIN") isSuperAdmin = true;
    if (SCOPE_RANK[role.dataScope] > SCOPE_RANK[scope]) scope = role.dataScope;
    for (const rp of role.permissions) permissions.add(rp.permission.key);
  }
  return {
    userId: user.id,
    username: user.username,
    fullName: user.fullName,
    locale: user.locale,
    showroomId: user.showroomId,
    dataScope: isSuperAdmin ? "ALL" : scope,
    permissions,
    warehouseIds: user.warehouses.map((w) => w.warehouseId),
    isSuperAdmin,
  };
}

export interface ResolvedSession {
  actor: Actor;
  sessionId: string;
  tokenHash: string;
  mustChangePassword: boolean;
}

/** Validates a session token and returns the actor, or null if invalid/expired/revoked. */
export async function resolveSession(db: Db, token: string | undefined | null): Promise<ResolvedSession | null> {
  if (!token || token.length > 100) return null;
  const tokenHash = hashToken(token);
  const session = await db.userSession.findUnique({
    where: { tokenHash },
    select: { id: true, userId: true, expiresAt: true, revokedAt: true, lastSeenAt: true, user: { select: { mustChangePassword: true } } },
  });
  if (!session || session.revokedAt || session.expiresAt <= new Date()) return null;
  const actor = await loadActor(db, session.userId);
  if (!actor) return null;
  if (Date.now() - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
    await db.userSession.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } });
  }
  return { actor, sessionId: session.id, tokenHash, mustChangePassword: session.user.mustChangePassword };
}
