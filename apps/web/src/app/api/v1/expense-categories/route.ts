import { expenses } from "@edge/core";
import { readJson, route } from "@/server/api";

export const GET = route(async ({ ctx }) => expenses.listCategories(ctx));

export const POST = route(async ({ ctx, req }) => { const body = await readJson(req); return expenses.createCategory(ctx, body); });
