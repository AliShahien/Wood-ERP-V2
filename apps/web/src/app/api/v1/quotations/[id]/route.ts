import { quotations } from "@edge/core";
import { readJson, route } from "@/server/api";

export const GET = route<{ id: string }>(async ({ ctx, params }) => quotations.getQuotation(ctx, params.id));

export const PUT = route<{ id: string }>(async ({ ctx, req, params }) => { const body = await readJson(req); return quotations.updateQuotation(ctx, params.id, body); });
