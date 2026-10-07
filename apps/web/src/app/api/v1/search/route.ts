import { dashboard } from "@edge/core";
import { route } from "@/server/api";

export const GET = route(async ({ ctx, req }) => ({ items: await dashboard.globalSearch(ctx, req.nextUrl.searchParams.get("q") ?? "") }), {
  rateLimit: { limit: 240, windowMs: 60_000 },
});
