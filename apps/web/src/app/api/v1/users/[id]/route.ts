import { users } from "@edge/core";
import { readJson, route } from "@/server/api";

export const GET = route<{ id: string }>(async ({ ctx, params }) => users.getUser(ctx, params.id));

export const PATCH = route<{ id: string }>(async ({ req, ctx, params }) => users.updateUser(ctx, params.id, await readJson(req)));
