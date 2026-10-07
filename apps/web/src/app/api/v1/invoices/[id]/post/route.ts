import { receivables } from "@edge/core";
import { route } from "@/server/api";

export const POST = route<{ id: string }>(async ({ ctx, params }) => receivables.postInvoice(ctx, params.id));
