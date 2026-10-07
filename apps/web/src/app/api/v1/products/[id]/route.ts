import { products } from "@edge/core";
import { readJson, route } from "@/server/api";

export const GET = route<{ id: string }>(async ({ ctx, params }) => products.getProduct(ctx, params.id));

export const PATCH = route<{ id: string }>(async ({ ctx, req, params }) => { const body = await readJson(req); return products.updateProduct(ctx, params.id, body); });

export const DELETE = route<{ id: string }>(async ({ ctx, params }) => { await products.deleteProduct(ctx, params.id); return { ok: true }; });
