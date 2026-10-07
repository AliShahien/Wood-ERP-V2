import { NextResponse } from "next/server";
import spec from "@/server/openapi.json";
import { route } from "@/server/api";

/** OpenAPI description of the REST API (authenticated users only). Regenerate: node scripts/gen-api-docs.mjs */
export const GET = route(async () => NextResponse.json(spec));
