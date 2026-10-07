import { attachments } from "@edge/core";
import { route } from "@/server/api";

export const DELETE = route<{ id: string }>(async ({ ctx, params }) => { await attachments.deleteAttachment(ctx, params.id); return { ok: true }; });
