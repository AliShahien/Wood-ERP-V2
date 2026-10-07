import { manufacturing } from "@edge/core";
import { route } from "@/server/api";

export const GET = route<{ id: string }>(async ({ ctx, params }) => manufacturing.costVariance(ctx, params.id));
