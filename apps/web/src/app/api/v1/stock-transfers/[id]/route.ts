import { inventory } from "@edge/core";
import { route } from "@/server/api";

export const GET = route<{ id: string }>(async ({ ctx, params }) => inventory.getTransfer(ctx, params.id));
