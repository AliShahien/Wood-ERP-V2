import { products } from "@edge/core";
import { readJson, route } from "@/server/api";

export const GET = route(async ({ ctx }) => products.listProductCategories(ctx));

export const POST = route(async ({ ctx, req }) => { const body = await readJson(req); return products.createProductCategory(ctx, body); });
