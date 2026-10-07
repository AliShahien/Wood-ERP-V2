import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { AppError, login, parse } from "@edge/core";
import { getDb } from "@edge/db";
import { checkOrigin, errorResponse, readJson, toErrorResponse } from "@/server/api";
import { log } from "@/server/log";
import { rateLimit } from "@/server/rate-limit";
import { requestMeta, SESSION_COOKIE, sessionCookieOptions } from "@/server/session";
import { LOCALE_COOKIE } from "@edge/i18n";

const schema = z.object({ username: z.string().trim().min(1).max(200), password: z.string().min(1).max(200) });

export async function POST(req: NextRequest) {
  try {
    if (!checkOrigin(req)) return errorResponse(new AppError("FORBIDDEN", "errors.csrf"));
    const meta = await requestMeta();
    // Per-IP brute-force limit on top of the per-account lockout.
    if (!rateLimit(`login:${meta.ip ?? "unknown"}`, 20, 15 * 60_000)) {
      return errorResponse(new AppError("RATE_LIMITED", "errors.rateLimited"));
    }
    const { username, password } = parse(schema, await readJson(req));
    const result = await login(getDb(), username, password, meta);
    const res = NextResponse.json({ ok: true, mustChangePassword: result.mustChangePassword, locale: result.locale });
    res.cookies.set(SESSION_COOKIE, result.token, sessionCookieOptions(result.expiresAt));
    res.cookies.set(LOCALE_COOKIE, result.locale, { path: "/", sameSite: "lax", maxAge: 365 * 86400 });
    return res;
  } catch (err) {
    if (err instanceof AppError && err.code === "UNAUTHENTICATED") log.warn("auth.login_failed", { reason: err.messageKey });
    return toErrorResponse(err, "/api/v1/auth/login");
  }
}
