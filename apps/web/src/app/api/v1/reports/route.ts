import { reports } from "@edge/core";
import { route } from "@/server/api";

export const GET = route(async ({ ctx }) => reports.availableReports(ctx));
