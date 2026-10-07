import { inventory } from "@edge/core";
import { route } from "@/server/api";

export const GET = route(async ({ ctx, req }) => { const query = Object.fromEntries(req.nextUrl.searchParams); return inventory.stockBalances(ctx, query); });
