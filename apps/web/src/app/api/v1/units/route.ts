import { materials } from "@edge/core";
import { readJson, route } from "@/server/api";

export const GET = route(async ({ ctx }) => materials.listUnits(ctx));

export const POST = route(async ({ ctx, req }) => { const body = await readJson(req); return materials.createUnit(ctx, body); });
