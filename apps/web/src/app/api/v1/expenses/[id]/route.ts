import { expenses } from "@edge/core";
import { route } from "@/server/api";

export const GET = route<{ id: string }>(async ({ ctx, params }) => expenses.getExpense(ctx, params.id));
