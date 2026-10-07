import { manufacturing } from "@edge/core";
import { route } from "@/server/api";

export const POST = route<{ id: string }>(async ({ ctx, params }) => manufacturing.startProduction(ctx, params.id));
