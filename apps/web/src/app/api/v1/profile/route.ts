import { NextResponse } from "next/server";
import { users } from "@edge/core";
import { LOCALE_COOKIE } from "@edge/i18n";
import { readJson, route } from "@/server/api";

export const PATCH = route(async ({ req, ctx }) => {
  const profile = await users.updateOwnProfile(ctx, await readJson(req));
  const res = NextResponse.json(profile);
  res.cookies.set(LOCALE_COOKIE, profile.locale, { path: "/", sameSite: "lax", maxAge: 365 * 86400 });
  return res;
});
