import { purchasing } from "@edge/core";
import { route } from "@/server/api";

export const POST = route<{ id: string }>(async ({ ctx, params }) => purchasing.postGoodsReceipt(ctx, params.id));
