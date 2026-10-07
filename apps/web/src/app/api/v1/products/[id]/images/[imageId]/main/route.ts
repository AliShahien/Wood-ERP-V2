import { products } from "@edge/core";
import { route } from "@/server/api";

export const POST = route<{ id: string; imageId: string }>(async ({ ctx, params }) => { await products.setMainImage(ctx, params.id, params.imageId); return { ok: true }; });
