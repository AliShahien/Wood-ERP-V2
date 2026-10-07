import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { resolveSession, type ResolvedSession, type ServiceContext } from "@edge/core";
import { getDb } from "@edge/db";

export const SESSION_COOKIE = "edge_session";

export function sessionCookieOptions(expires: Date) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    expires,
  };
}

/** Resolved once per request (React cache) for server components and route handlers. */
export const getSession = cache(async (): Promise<ResolvedSession | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return resolveSession(getDb(), token);
});

export async function requestMeta() {
  const h = await headers();
  const fwd = h.get("x-forwarded-for");
  return { ip: fwd ? fwd.split(",")[0]!.trim() : h.get("x-real-ip"), userAgent: h.get("user-agent") };
}

/** For pages: redirects to /login when not signed in, or to password change when required. */
export async function requirePageContext(opts: { allowPasswordChange?: boolean } = {}): Promise<ServiceContext & { session: ResolvedSession }> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.mustChangePassword && !opts.allowPasswordChange) redirect("/change-password");
  return { db: getDb(), actor: session.actor, meta: await requestMeta(), session };
}
