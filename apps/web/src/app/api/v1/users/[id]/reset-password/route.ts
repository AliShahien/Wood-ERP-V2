import { users } from "@edge/core";
import { readJson, route } from "@/server/api";

export const POST = route<{ id: string }>(async ({ req, ctx, params }) => {
  await users.resetPassword(ctx, params.id, await readJson(req));
  return { ok: true };
});
