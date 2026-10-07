import { measurements } from "@edge/core";
import { readJson, route } from "@/server/api";

export const GET = route<{ id: string }>(async ({ ctx, params }) => measurements.getMeasurement(ctx, params.id));

export const PUT = route<{ id: string }>(async ({ ctx, req, params }) => { const body = await readJson(req); return measurements.reviseMeasurement(ctx, params.id, body); });
