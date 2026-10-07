import { NextResponse, type NextRequest } from "next/server";
import { AppError, logout } from "@edge/core";
import { getDb } from "@edge/db";
import { checkOrigin, errorResponse, toErrorResponse } from "@/server/api";
import { SESSION_COOKIE } from "@/server/session";

export async function POST(req: NextRequest) {
  try {
    if (!checkOrigin(req)) return errorResponse(new AppError("FORBIDDEN", "errors.csrf"));
    const token = req.cookies.get(SESSION_COOKIE)?.value;
    if (token) await logout(getDb(), token);
    const res = NextResponse.json({ ok: true });
    res.cookies.delete(SESSION_COOKIE);
    return res;
  } catch (err) {
    return toErrorResponse(err, "/api/v1/auth/logout");
  }
}
