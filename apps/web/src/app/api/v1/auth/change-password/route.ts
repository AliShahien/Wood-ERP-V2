import { users } from "@edge/core";
import { readJson, route } from "@/server/api";

export const POST = route(
  async ({ req, ctx, session }) => {
    await users.changeOwnPassword(ctx, await readJson(req), session.tokenHash);
    return { ok: true };
  },
  { rateLimit: { limit: 10, windowMs: 15 * 60_000 } },
);
