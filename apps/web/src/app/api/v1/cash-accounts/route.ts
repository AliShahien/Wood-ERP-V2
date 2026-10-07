import { cashAccounts } from "@edge/core";
import { readJson, route } from "@/server/api";

export const GET = route(async ({ ctx }) => cashAccounts.listCashAccounts(ctx));

export const POST = route(async ({ ctx, req }) => { const body = await readJson(req); return cashAccounts.createCashAccount(ctx, body); });
