import { deliveries } from "@edge/core";
import { route } from "@/server/api";
import { readUpload } from "@/server/upload";

export const POST = route<{ id: string }>(async ({ ctx, req, params }) => {
  const { file } = await readUpload(req);
  return deliveries.saveSignature(ctx, params.id, file);
});
