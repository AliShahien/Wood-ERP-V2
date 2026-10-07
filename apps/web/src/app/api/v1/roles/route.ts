import { roles } from "@edge/core";
import { readJson, route } from "@/server/api";

export const GET = route(async ({ ctx }) => ({ items: await roles.listRoles(ctx) }));

export const POST = route(async ({ req, ctx }) => roles.createRole(ctx, await readJson(req)));
