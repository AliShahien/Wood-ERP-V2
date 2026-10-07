import { salesOrders } from "@edge/core";
import { readJson, route } from "@/server/api";

export const POST = route<{ id: string }>(async ({ ctx, req, params }) => { const body = await readJson(req); return salesOrders.cancelSalesOrder(ctx, params.id, body); });
