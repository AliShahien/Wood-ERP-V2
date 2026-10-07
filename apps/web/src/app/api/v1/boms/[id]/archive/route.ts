import { bom } from "@edge/core";
import { route } from "@/server/api";

export const POST = route<{ id: string }>(async ({ ctx, params }) => bom.archiveBom(ctx, params.id));
