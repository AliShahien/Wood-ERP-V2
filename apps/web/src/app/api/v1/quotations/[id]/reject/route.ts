import { quotations } from "@edge/core";
import { readJson, route } from "@/server/api";

export const POST = route<{ id: string }>(async ({ ctx, req, params }) => { const body = await readJson(req); return quotations.rejectQuotation(ctx, params.id, body); });
