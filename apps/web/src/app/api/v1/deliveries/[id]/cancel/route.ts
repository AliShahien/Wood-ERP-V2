import { deliveries } from "@edge/core";
import { readJson, route } from "@/server/api";

export const POST = route<{ id: string }>(async ({ ctx, req, params }) => { const body = await readJson(req); await deliveries.cancelDelivery(ctx, params.id, body); return { ok: true }; });
