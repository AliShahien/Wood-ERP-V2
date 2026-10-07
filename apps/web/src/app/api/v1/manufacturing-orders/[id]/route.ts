import { manufacturing } from "@edge/core";
import { readJson, route } from "@/server/api";

export const GET = route<{ id: string }>(async ({ ctx, params }) => manufacturing.getManufacturingOrder(ctx, params.id));

export const PATCH = route<{ id: string }>(async ({ ctx, req, params }) => { const body = await readJson(req); return manufacturing.updateManufacturingOrder(ctx, params.id, body); });
