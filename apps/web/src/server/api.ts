import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { AppError, mapDbError, type ServiceContext, type ResolvedSession } from "@edge/core";
import { getDb } from "@edge/db";
import { log } from "./log";
import { rateLimit } from "./rate-limit";
import { getSession, requestMeta } from "./session";

type RouteParams = Record<string, string>;

export interface HandlerArgs<P extends RouteParams> {
  req: NextRequest;
  params: P;
  ctx: ServiceContext;
  session: ResolvedSession;
}

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function errorResponse(err: AppError) {
  return NextResponse.json({ error: { code: err.code, messageKey: err.messageKey, details: err.details } }, { status: err.status });
}

/** CSRF defence for cookie-authenticated mutations: the Origin must be our own. */
export function checkOrigin(req: NextRequest): boolean {
  if (!MUTATING.has(req.method)) return true;
  const origin = req.headers.get("origin");
  if (!origin) return false;
  const allowed = new Set([req.nextUrl.origin]);
  if (process.env.APP_URL) allowed.add(new URL(process.env.APP_URL).origin);
  return allowed.has(origin);
}

export function toErrorResponse(err: unknown, route: string) {
  const mapped = mapDbError(err);
  if (mapped instanceof AppError) return errorResponse(mapped);
  log.error("api.unhandled", { route, error: err instanceof Error ? err.message : String(err), stack: err instanceof Error ? err.stack : undefined });
  return errorResponse(new AppError("INTERNAL", "errors.internal"));
}

export async function readJson(req: NextRequest): Promise<unknown> {
  if (!req.headers.get("content-type")?.includes("application/json")) return {};
  try {
    return await req.json();
  } catch {
    throw new AppError("VALIDATION", "errors.validation", [{ path: "", code: "invalid_json" }]);
  }
}

/**
 * Wraps an authenticated route handler: origin check, session, rate limit, error mapping.
 * The handler returns plain data (→ 200 JSON) or a NextResponse.
 */
export function route<P extends RouteParams = RouteParams>(
  handler: (args: HandlerArgs<P>) => Promise<unknown>,
  opts: { rateLimit?: { limit: number; windowMs: number } } = {},
) {
  return async (req: NextRequest, context: { params: Promise<P> }) => {
    const started = Date.now();
    const path = req.nextUrl.pathname;
    try {
      if (!checkOrigin(req)) return errorResponse(new AppError("FORBIDDEN", "errors.csrf"));
      const session = await getSession();
      if (!session) return errorResponse(new AppError("UNAUTHENTICATED", "errors.unauthenticated"));
      const rl = opts.rateLimit ?? (MUTATING.has(req.method) ? { limit: 120, windowMs: 60_000 } : { limit: 600, windowMs: 60_000 });
      if (!rateLimit(`${session.actor.userId}:${req.method}`, rl.limit, rl.windowMs)) {
        return errorResponse(new AppError("RATE_LIMITED", "errors.rateLimited"));
      }
      const ctx: ServiceContext = { db: getDb(), actor: session.actor, meta: await requestMeta() };
      const result = await handler({ req, params: await context.params, ctx, session });
      if (result instanceof NextResponse || result instanceof Response) return result;
      return NextResponse.json(result ?? { ok: true });
    } catch (err) {
      return toErrorResponse(err, path);
    } finally {
      const ms = Date.now() - started;
      if (ms > 1500) log.warn("api.slow", { route: path, method: req.method, durationMs: ms });
    }
  };
}
