import { salesOrders } from "@edge/core";
import { route } from "@/server/api";

export const GET = route<{ id: string }>(async ({ ctx, params }) => salesOrders.getSalesOrder(ctx, params.id));
