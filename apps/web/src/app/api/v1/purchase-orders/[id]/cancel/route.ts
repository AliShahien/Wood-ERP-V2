import { purchasing } from "@edge/core";
import { readJson, route } from "@/server/api";

export const POST = route<{ id: string }>(async ({ ctx, req, params }) => { const body = await readJson(req); return purchasing.transitionPurchaseOrder(ctx, params.id, "CANCELLED", body); });
