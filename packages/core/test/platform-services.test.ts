import { describe, expect, it } from "vitest";
import * as dashboard from "../src/modules/dashboard";
import * as jobs from "../src/modules/jobs";
import * as notifications from "../src/modules/notifications";
import * as roles from "../src/modules/roles";
import * as users from "../src/modules/users";
import * as customers from "../src/modules/customers";
import { adminCtx, ctxFor, uniq } from "./helpers";

describe("notifications", () => {
  it("fan out only to users holding the permission and are idempotent by dedupe key", async () => {
    const ctx = await adminCtx();
    const inv = await roles.createRole(ctx, { code: `INV_${uniq().toUpperCase()}`, nameAr: "مخزن", nameEn: "Inv", dataScope: "ALL", permissions: ["inventory.view"] });
    const other = await roles.createRole(ctx, { code: `OTH_${uniq().toUpperCase()}`, nameAr: "أخرى", nameEn: "Other", dataScope: "ALL", permissions: ["customers.view"] });
    const u1 = await users.createUser(ctx, { fullName: "Inv", username: `n1${uniq()}`, password: "Passw0rd1", roleIds: [inv.id] });
    const u2 = await users.createUser(ctx, { fullName: "Oth", username: `n2${uniq()}`, password: "Passw0rd1", roleIds: [other.id] });
    const key = `test:${uniq()}`;
    await notifications.notify(ctx.db, { type: "low_stock", permission: "inventory.view", params: { code: "X" }, dedupeKey: key });
    await notifications.notify(ctx.db, { type: "low_stock", permission: "inventory.view", params: { code: "X" }, dedupeKey: key });
    expect(await ctx.db.notification.count({ where: { userId: u1.id, dedupeKey: key } })).toBe(1);
    expect(await ctx.db.notification.count({ where: { userId: u2.id, dedupeKey: key } })).toBe(0);
    const c1 = await ctxFor(u1.id);
    const mine = await notifications.listMyNotifications(c1, {});
    expect(mine.unread).toBeGreaterThan(0);
    await notifications.markRead(c1, { all: true });
    expect(await notifications.unreadCount(c1)).toBe(0);
  });
});

describe("jobs", () => {
  it("scheduled checks run idempotently and the queue processes / retries jobs", async () => {
    const ctx = await adminCtx();
    const r1 = await jobs.runScheduledChecks(ctx.db);
    const before = await ctx.db.notification.count();
    await jobs.runScheduledChecks(ctx.db);
    expect(await ctx.db.notification.count()).toBe(before); // same day → deduped
    expect(r1).toHaveProperty("lowStock");
    await jobs.enqueueJob(ctx.db, "scheduled.checks");
    await jobs.enqueueJob(ctx.db, "does.not.exist");
    const processed = await jobs.processJobs(ctx.db, 5);
    expect(processed).toBeGreaterThanOrEqual(2);
    const failed = await ctx.db.job.findFirstOrThrow({ where: { type: "does.not.exist" } });
    expect(failed.status).toBe("PENDING"); // retried later with backoff
    expect(failed.lastError).toContain("no handler");
  });
});

describe("dashboard and search", () => {
  it("returns only permitted sections, computed from data", async () => {
    const ctx = await adminCtx();
    const d = await dashboard.getDashboard(ctx);
    expect(Object.keys(d).sort()).toEqual(["finance", "inventory", "production", "sales"]);
    const role = await roles.createRole(ctx, { code: `DS_${uniq().toUpperCase()}`, nameAr: "مبيعات", nameEn: "S", dataScope: "ALL", permissions: ["dashboard.sales"] });
    const u = await users.createUser(ctx, { fullName: "S", username: `ds${uniq()}`, password: "Passw0rd1", roleIds: [role.id] });
    expect(Object.keys(await dashboard.getDashboard(await ctxFor(u.id)))).toEqual(["sales"]);
  });

  it("aggregates invoice history without crossing showroom or owner scope", async () => {
    const ctx = await adminCtx();
    const tag = uniq();
    const [ownShowroom, otherShowroom] = await Promise.all([
      ctx.db.showroom.create({ data: { code: `S${tag}A`, name: "معرض أ" } }),
      ctx.db.showroom.create({ data: { code: `S${tag}B`, name: "معرض ب" } }),
    ]);
    const showroomRole = await roles.createRole(ctx, { code: `SH_${tag.toUpperCase()}`, nameAr: "معرض", nameEn: "Showroom", dataScope: "SHOWROOM", permissions: ["dashboard.sales"] });
    const ownRole = await roles.createRole(ctx, { code: `OW_${tag.toUpperCase()}`, nameAr: "شخصي", nameEn: "Own", dataScope: "OWN", permissions: ["dashboard.sales"] });
    const scopedUser = await users.createUser(ctx, { fullName: "Scoped", username: `sc${tag}`, password: "Passw0rd1", roleIds: [showroomRole.id], showroomId: ownShowroom.id });
    const ownUser = await users.createUser(ctx, { fullName: "Owned", username: `ow${tag}`, password: "Passw0rd1", roleIds: [ownRole.id], showroomId: ownShowroom.id });
    const [c1, c2] = await Promise.all([
      ctx.db.customer.create({ data: { code: `SC-${tag}`, name: "عميل أ", showroomId: ownShowroom.id } }),
      ctx.db.customer.create({ data: { code: `OC-${tag}`, name: "عميل ب", showroomId: otherShowroom.id } }),
    ]);
    await ctx.db.customerInvoice.createMany({ data: [
      { number: `INV-${tag}-1`, customerId: c1.id, showroomId: ownShowroom.id, invoiceDate: new Date(), status: "POSTED", total: 100, createdById: ownUser.id },
      { number: `INV-${tag}-2`, customerId: c2.id, showroomId: otherShowroom.id, invoiceDate: new Date(), status: "POSTED", total: 900, createdById: ctx.actor.userId },
    ] });
    const showroomSales = (await dashboard.getDashboard(await ctxFor(scopedUser.id))).sales as { month: number; byMonth: { value: number }[] };
    const ownSales = (await dashboard.getDashboard(await ctxFor(ownUser.id))).sales as { month: number; byMonth: { value: number }[] };
    expect(showroomSales.month).toBe(100);
    expect(showroomSales.byMonth.reduce((sum, row) => sum + row.value, 0)).toBe(100);
    expect(ownSales.month).toBe(100);
    expect(ownSales.byMonth.reduce((sum, row) => sum + row.value, 0)).toBe(100);
  });

  it("global search respects permissions", async () => {
    const ctx = await adminCtx();
    const tag = uniq();
    await customers.createCustomer(ctx, { name: `بحث ${tag}`, phone: "01234567890" });
    const hits = await dashboard.globalSearch(ctx, tag);
    expect(hits.some((h) => h.type === "customer")).toBe(true);
    const role = await roles.createRole(ctx, { code: `NS_${uniq().toUpperCase()}`, nameAr: "x", nameEn: "x", dataScope: "ALL", permissions: ["materials.view"] });
    const u = await users.createUser(ctx, { fullName: "N", username: `ns${uniq()}`, password: "Passw0rd1", roleIds: [role.id] });
    expect((await dashboard.globalSearch(await ctxFor(u.id), tag)).some((h) => h.type === "customer")).toBe(false);
  });
});
