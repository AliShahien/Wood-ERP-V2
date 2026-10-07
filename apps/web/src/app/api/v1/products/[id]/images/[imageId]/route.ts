import { products } from "@edge/core";
import { route } from "@/server/api";

export const DELETE = route<{ id: string; imageId: string }>(async ({ ctx, params }) => { await products.deleteProductImage(ctx, params.id, params.imageId); return { ok: true }; });
