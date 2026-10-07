import { materials } from "@edge/core";
import { readJson, route } from "@/server/api";

export const GET = route<{ id: string }>(async ({ ctx, params }) => materials.getMaterial(ctx, params.id));

export const PATCH = route<{ id: string }>(async ({ ctx, req, params }) => { const body = await readJson(req); return materials.updateMaterial(ctx, params.id, body); });

export const DELETE = route<{ id: string }>(async ({ ctx, params }) => { await materials.deleteMaterial(ctx, params.id); return { ok: true }; });
