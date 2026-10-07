import { quotations } from "@edge/core";
import { route } from "@/server/api";

export const POST = route<{ id: string }>(async ({ ctx, params }) => quotations.submitQuotation(ctx, params.id));
