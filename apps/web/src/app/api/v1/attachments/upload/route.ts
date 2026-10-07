import { attachments } from "@edge/core";
import { route } from "@/server/api";
import { readUpload } from "@/server/upload";

export const POST = route(
  async ({ ctx, req }) => {
    const { file, fileName, fields } = await readUpload(req);
    return attachments.uploadAttachment(ctx, { ...fields, fileName }, file);
  },
  { rateLimit: { limit: 60, windowMs: 60_000 } },
);
