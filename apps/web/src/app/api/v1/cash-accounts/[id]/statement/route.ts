import { cashAccounts } from "@edge/core";
import { route } from "@/server/api";

export const GET = route<{ id: string }>(async ({ ctx, req, params }) => { const query = Object.fromEntries(req.nextUrl.searchParams); return cashAccounts.cashAccountStatement(ctx, params.id, query); });
