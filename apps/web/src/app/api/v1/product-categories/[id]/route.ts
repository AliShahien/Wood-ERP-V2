import { products } from "@edge/core";
import { readJson, route } from "@/server/api";

export const PATCH = route<{ id: string }>(async ({ ctx, req, params }) => { const body = await readJson(req); return products.updateProductCategory(ctx, params.id, body); });
