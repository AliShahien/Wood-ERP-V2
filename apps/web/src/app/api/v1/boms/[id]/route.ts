import { bom } from "@edge/core";
import { readJson, route } from "@/server/api";

export const GET = route<{ id: string }>(async ({ ctx, params }) => bom.getBom(ctx, params.id));

export const PUT = route<{ id: string }>(async ({ ctx, req, params }) => { const body = await readJson(req); return bom.updateBom(ctx, params.id, body); });
