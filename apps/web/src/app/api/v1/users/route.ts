import { users } from "@edge/core";
import { readJson, route } from "@/server/api";

export const GET = route(async ({ req, ctx }) => users.listUsers(ctx, Object.fromEntries(req.nextUrl.searchParams)));

export const POST = route(async ({ req, ctx }) => users.createUser(ctx, await readJson(req)));
