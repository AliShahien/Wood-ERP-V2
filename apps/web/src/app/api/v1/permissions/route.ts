import { requirePermission, roles } from "@edge/core";
import { route } from "@/server/api";

export const GET = route(async ({ ctx }) => {
  requirePermission(ctx, "roles.view");
  return { items: roles.listPermissionCatalog() };
});
