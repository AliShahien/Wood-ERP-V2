import { suppliers } from "@edge/core";
import { readJson, route } from "@/server/api";

export const GET = route<{ id: string }>(async ({ ctx, params }) => suppliers.getSupplier(ctx, params.id));

export const PATCH = route<{ id: string }>(async ({ ctx, req, params }) => { const body = await readJson(req); return suppliers.updateSupplier(ctx, params.id, body); });

export const DELETE = route<{ id: string }>(async ({ ctx, params }) => { await suppliers.deleteSupplier(ctx, params.id); return { ok: true }; });
