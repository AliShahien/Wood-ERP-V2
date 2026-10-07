import { products } from "@edge/core";
import { route } from "@/server/api";
import { readUpload } from "@/server/upload";

export const POST = route<{ id: string }>(
  async ({ ctx, req, params }) => {
    const { file, fields } = await readUpload(req);
    return products.uploadProductImage(ctx, params.id, file, { altText: fields.altText });
  },
  { rateLimit: { limit: 60, windowMs: 60_000 } },
);
