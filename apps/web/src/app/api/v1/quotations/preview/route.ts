import { quotations } from "@edge/core";
import { readJson, route } from "@/server/api";

export const POST = route(async ({ ctx, req }) => { const body = await readJson(req); return quotations.previewQuotation(ctx, body); });
