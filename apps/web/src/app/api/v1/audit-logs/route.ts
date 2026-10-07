import { auditLogs } from "@edge/core";
import { route } from "@/server/api";

export const GET = route(async ({ req, ctx }) => auditLogs.listAuditLogs(ctx, Object.fromEntries(req.nextUrl.searchParams)));
