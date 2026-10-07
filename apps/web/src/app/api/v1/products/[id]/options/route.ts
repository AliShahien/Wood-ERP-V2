import { products } from "@edge/core";
import { readJson, route } from "@/server/api";

export const PUT = route<{ id: string }>(async ({ ctx, req, params }) => { const body = await readJson(req); return products.setProductOptions(ctx, params.id, body); });
