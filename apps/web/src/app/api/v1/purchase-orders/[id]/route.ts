import { purchasing } from "@edge/core";
import { readJson, route } from "@/server/api";

export const GET = route<{ id: string }>(async ({ ctx, params }) => purchasing.getPurchaseOrder(ctx, params.id));

export const PUT = route<{ id: string }>(async ({ ctx, req, params }) => { const body = await readJson(req); return purchasing.updatePurchaseOrder(ctx, params.id, body); });
