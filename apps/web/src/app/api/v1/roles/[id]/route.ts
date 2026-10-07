import { roles } from "@edge/core";
import { readJson, route } from "@/server/api";

export const GET = route<{ id: string }>(async ({ ctx, params }) => roles.getRole(ctx, params.id));

export const PATCH = route<{ id: string }>(async ({ req, ctx, params }) => roles.updateRole(ctx, params.id, await readJson(req)));

export const DELETE = route<{ id: string }>(async ({ ctx, params }) => {
  await roles.deleteRole(ctx, params.id);
  return { ok: true };
});
