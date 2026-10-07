import { manufacturing } from "@edge/core";
import { route } from "@/server/api";

export const POST = route<{ id: string }>(async ({ ctx, params }) => manufacturing.createFromSalesOrder(ctx, params.id));
