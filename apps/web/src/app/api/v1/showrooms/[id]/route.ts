import { showrooms } from "@edge/core";
import { readJson, route } from "@/server/api";

export const GET = route<{ id: string }>(async ({ ctx, params }) => showrooms.getShowroom(ctx, params.id));

export const PATCH = route<{ id: string }>(async ({ ctx, req, params }) => { const body = await readJson(req); return showrooms.updateShowroom(ctx, params.id, body); });

export const DELETE = route<{ id: string }>(async ({ ctx, params }) => { await showrooms.deleteShowroom(ctx, params.id); return { ok: true }; });
