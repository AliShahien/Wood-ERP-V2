import { dashboard } from "@edge/core";
import { route } from "@/server/api";

export const GET = route(async ({ ctx }) => dashboard.getDashboard(ctx));
