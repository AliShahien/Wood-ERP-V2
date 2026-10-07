import { products } from "@edge/core";
import { readJson, route } from "@/server/api";

export const GET = route(async ({ ctx, req }) => { const query = Object.fromEntries(req.nextUrl.searchParams); return products.listOptions(ctx, query); });

export const POST = route(async ({ ctx, req }) => { const body = await readJson(req); return products.createOption(ctx, body); });
