import { productionStages } from "@edge/core";
import { readJson, route } from "@/server/api";

export const GET = route(async ({ ctx }) => productionStages.listStages(ctx));

export const POST = route(async ({ ctx, req }) => { const body = await readJson(req); return productionStages.createStage(ctx, body); });
