import { manufacturing } from "@edge/core";
import { route } from "@/server/api";

export const GET = route<{ id: string }>(async ({ ctx, params }) => manufacturing.getMaterialIssue(ctx, params.id));
