import { deliveries } from "@edge/core";
import { readJson, route } from "@/server/api";

export const POST = route<{ id: string }>(async ({ ctx, req, params }) => { const body = await readJson(req); return deliveries.createDelivery(ctx, params.id, body); });

export const GET = route<{ id: string }>(async ({ ctx, params }) => deliveries.deliverableLines(ctx, params.id));
