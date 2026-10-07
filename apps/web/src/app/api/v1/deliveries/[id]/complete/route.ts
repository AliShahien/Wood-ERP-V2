import { deliveries } from "@edge/core";
import { readJson, route } from "@/server/api";

export const POST = route<{ id: string }>(async ({ ctx, req, params }) => { const body = await readJson(req); return deliveries.completeDelivery(ctx, params.id, body); });
