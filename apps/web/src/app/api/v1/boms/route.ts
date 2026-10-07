import { bom } from "@edge/core";
import { readJson, route } from "@/server/api";

export const GET = route(async ({ ctx, req }) => { const query = Object.fromEntries(req.nextUrl.searchParams); return bom.listBoms(ctx, query); });

export const POST = route(async ({ ctx, req }) => { const body = await readJson(req); return bom.createBom(ctx, body); });
