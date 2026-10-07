import { purchasing } from "@edge/core";
import { route } from "@/server/api";

export const GET = route<{ id: string }>(async ({ ctx, params }) => purchasing.getGoodsReceipt(ctx, params.id));
