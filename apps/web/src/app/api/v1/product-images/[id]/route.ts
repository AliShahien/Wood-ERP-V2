import { products } from "@edge/core";
import { route } from "@/server/api";

/** Authenticated image stream. Image ids are immutable, so the browser may cache privately. */
export const GET = route<{ id: string }>(
  async ({ ctx, params }) => {
    const obj = await products.readProductImage(ctx, params.id);
    return new Response(new Uint8Array(obj.body), {
      headers: {
        "content-type": obj.contentType ?? "application/octet-stream",
        "cache-control": "private, max-age=604800, immutable",
        "x-content-type-options": "nosniff",
      },
    });
  },
  { rateLimit: { limit: 2000, windowMs: 60_000 } },
);
