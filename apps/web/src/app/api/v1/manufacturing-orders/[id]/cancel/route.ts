import { manufacturing } from "@edge/core";
import { readJson, route } from "@/server/api";

export const POST = route<{ id: string }>(async ({ ctx, req, params }) => { const body = await readJson(req); await manufacturing.cancelManufacturingOrder(ctx, params.id, body); return { ok: true }; });
