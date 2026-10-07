import { requireAnyPermission, type ServiceContext } from "../context";

/** Small id/label lists for form selects. Full CRUD for these entities arrives in Phase 2. */
export async function showroomOptions(ctx: ServiceContext) {
  requireAnyPermission(ctx, "showrooms.view", "users.create", "users.edit", "customers.create", "customers.edit", "quotations.create", "expenses.create", "cash_accounts.manage");
  return ctx.db.showroom.findMany({
    where: { deletedAt: null, status: "ACTIVE" },
    select: { id: true, code: true, name: true },
    orderBy: { code: "asc" },
  });
}

export async function warehouseOptions(ctx: ServiceContext) {
  requireAnyPermission(ctx, "warehouses.view", "users.create", "users.edit");
  return ctx.db.warehouse.findMany({
    where: { deletedAt: null, status: "ACTIVE" },
    select: { id: true, code: true, name: true },
    orderBy: { code: "asc" },
  });
}

/** Active users for "manager / assignee / inspector" pickers. */
export async function userOptions(ctx: ServiceContext) {
  requireAnyPermission(
    ctx,
    "users.view", "showrooms.create", "showrooms.edit", "warehouses.create", "warehouses.edit",
    "manufacturing.create", "manufacturing.approve", "production.update", "quality.create", "measurements.create", "quotations.create", "deliveries.create",
  );
  return ctx.db.user.findMany({
    where: { deletedAt: null, status: "ACTIVE" },
    select: { id: true, fullName: true, code: true },
    orderBy: { fullName: "asc" },
    take: 500,
  });
}

export async function supplierOptions(ctx: ServiceContext) {
  requireAnyPermission(ctx, "suppliers.view", "materials.create", "materials.edit", "purchases.create");
  return ctx.db.supplier.findMany({ where: { deletedAt: null, status: "ACTIVE" }, select: { id: true, code: true, name: true }, orderBy: { name: "asc" }, take: 1000 });
}

export async function roleOptions(ctx: ServiceContext) {
  requireAnyPermission(ctx, "roles.view", "users.create", "users.edit");
  return ctx.db.role.findMany({
    where: { deletedAt: null, status: "ACTIVE", ...(ctx.actor.isSuperAdmin ? {} : { code: { not: "SUPER_ADMIN" } }) },
    select: { id: true, code: true, nameAr: true, nameEn: true },
    orderBy: { createdAt: "asc" },
  });
}
