import { receivables } from "@edge/core";
import { route } from "@/server/api";

export const GET = route<{ id: string }>(async ({ ctx, params }) => receivables.getPayment(ctx, params.id));
