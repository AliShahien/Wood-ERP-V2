import { warehouses } from "@edge/core";
import { readJson, route } from "@/server/api";

export const GET = route<{ id: string }>(async ({ ctx, params }) => warehouses.getWarehouse(ctx, params.id));

export const PATCH = route<{ id: string }>(async ({ ctx, req, params }) => { const body = await readJson(req); return warehouses.updateWarehouse(ctx, params.id, body); });

export const DELETE = route<{ id: string }>(async ({ ctx, params }) => { await warehouses.deleteWarehouse(ctx, params.id); return { ok: true }; });
