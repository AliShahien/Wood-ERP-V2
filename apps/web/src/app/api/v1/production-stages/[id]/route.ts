import { productionStages } from "@edge/core";
import { readJson, route } from "@/server/api";

export const PATCH = route<{ id: string }>(async ({ ctx, req, params }) => { const body = await readJson(req); return productionStages.updateStage(ctx, params.id, body); });
