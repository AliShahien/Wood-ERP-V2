import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import * as customers from "../src/modules/customers";
import * as materials from "../src/modules/materials";
import * as products from "../src/modules/products";
import * as attachments from "../src/modules/attachments";
import * as suppliers from "../src/modules/suppliers";
import * as users from "../src/modules/users";
import * as roles from "../src/modules/roles";
import { validateUpload } from "../src/platform/storage";
import { adminCtx, ctxFor, uniq } from "./helpers";

const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000100e221bc330000000049454e44ae426082", "hex");

beforeAll(() => {
  process.env.STORAGE_DRIVER = "local";
  process.env.LOCAL_STORAGE_DIR = mkdtempSync(path.join(tmpdir(), "edge-storage-"));
});

describe("customers", () => {
  it("auto-numbers customers and searches by phone", async () => {
    const ctx = await adminCtx();
    const a = await customers.createCustomer(ctx, { name: "أحمد محمود", phone: "01001234567" });
    const b = await customers.createCustomer(ctx, { name: "Sara Ali", phone: "01119876543" });
    expect(a.code).toMatch(/^CUS-\d{6}$/);
    expect(Number(b.code.slice(4))).toBe(Number(a.code.slice(4)) + 1);
    const found = await customers.listCustomers(ctx, { q: "0100123" });
    expect(found.items.map((c) => c.id)).toContain(a.id);
  });

  it("enforces showroom scope for scoped users", async () => {
    const ctx = await adminCtx();
    const s1 = await ctx.db.showroom.create({ data: { code: `S1${uniq()}`, name: "Showroom 1" } });
    const s2 = await ctx.db.showroom.create({ data: { code: `S2${uniq()}`, name: "Showroom 2" } });
    const mgrRole = await ctx.db.role.findUniqueOrThrow({ where: { code: "SHOWROOM_MANAGER" } });
    const mgr = await users.createUser(ctx, { fullName: "Mgr", username: `mgr${uniq()}`, password: "Passw0rd1", roleIds: [mgrRole.id], showroomId: s1.id });
    const mctx = await ctxFor(mgr.id);
    const other = await customers.createCustomer(ctx, { name: "Other showroom", showroomId: s2.id });
    // Scoped user's customer is forced into their own showroom even if they ask for another.
    const mine = await customers.createCustomer(mctx, { name: "Mine", showroomId: s2.id });
    expect(mine.showroomId).toBe(s1.id);
    const list = await customers.listCustomers(mctx, { pageSize: 100 });
    expect(list.items.every((c) => c.showroomId === s1.id)).toBe(true);
    await expect(customers.getCustomer(mctx, other.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(customers.updateCustomer(mctx, other.id, { name: "hack" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("OWN scope sees only own records", async () => {
    const ctx = await adminCtx();
    const s = await ctx.db.showroom.create({ data: { code: `S3${uniq()}`, name: "Showroom 3" } });
    const empRole = await ctx.db.role.findUniqueOrThrow({ where: { code: "SHOWROOM_EMPLOYEE" } });
    const e1 = await users.createUser(ctx, { fullName: "E1", username: `e1${uniq()}`, password: "Passw0rd1", roleIds: [empRole.id], showroomId: s.id });
    const e2 = await users.createUser(ctx, { fullName: "E2", username: `e2${uniq()}`, password: "Passw0rd1", roleIds: [empRole.id], showroomId: s.id });
    const c1 = await customers.createCustomer(await ctxFor(e1.id), { name: "E1 customer" });
    const e2ctx = await ctxFor(e2.id);
    await expect(customers.getCustomer(e2ctx, c1.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(customers.deleteCustomer(e2ctx, c1.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("materials", () => {
  it("keeps Arabic names and hides cost from users without costing.view", async () => {
    const ctx = await adminCtx();
    const cat = await ctx.db.materialCategory.findFirstOrThrow();
    const unit = await ctx.db.unit.findUniqueOrThrow({ where: { code: "M2" } });
    const m = await materials.createMaterial(ctx, { name: "قشرة جوز", categoryId: cat.id, unitId: unit.id, reorderLevel: 10 });
    expect(m.code).toMatch(/^MAT-\d{6}$/);
    expect(m.name).toBe("قشرة جوز");
    const adminView = await materials.getMaterial(ctx, m.id);
    expect(adminView).toHaveProperty("averageCost");

    const role = await roles.createRole(ctx, { code: `MATV_${uniq().toUpperCase()}`, nameAr: "عرض", nameEn: "View", dataScope: "ALL", permissions: ["materials.view"] });
    const u = await users.createUser(ctx, { fullName: "V", username: `mv${uniq()}`, password: "Passw0rd1", roleIds: [role.id] });
    const v = await materials.getMaterial(await ctxFor(u.id), m.id);
    expect(v).not.toHaveProperty("averageCost");
    expect(v).not.toHaveProperty("lastPurchaseCost");
  });

  it("lists low-stock materials (no stock yet ⇒ at/below reorder level)", async () => {
    const ctx = await adminCtx();
    const low = await materials.listMaterials(ctx, { lowStock: "1", pageSize: 100 });
    expect(low.total).toBeGreaterThan(0);
  });
});

describe("products and uploads", () => {
  it("validates real file type from magic bytes", () => {
    expect(validateUpload(PNG, ["image/png"]).mime).toBe("image/png");
    expect(() => validateUpload(Buffer.from("<svg onload=alert(1)>"), ["image/png"])).toThrow(/fileType/);
    expect(() => validateUpload(Buffer.from("%PDF-1.7"), ["image/png"])).toThrow(/fileType/);
    expect(() => validateUpload(Buffer.alloc(0), ["image/png"])).toThrow(/fileEmpty/);
  });

  it("creates a product, uploads images, first becomes main, gallery shows it", async () => {
    const ctx = await adminCtx();
    const cat = await ctx.db.productCategory.findFirstOrThrow();
    const p = await products.createProduct(ctx, { name: "Test Door", categoryId: cat.id, status: "ACTIVE", basePrice: 5000, minWidth: 600, maxWidth: 1200 });
    const img1 = await products.uploadProductImage(ctx, p.id, PNG);
    const img2 = await products.uploadProductImage(ctx, p.id, PNG);
    expect(img1.isMain).toBe(true);
    expect(img2.isMain).toBe(false);
    await products.setMainImage(ctx, p.id, img2.id);
    const gallery = await products.listProducts(ctx, { q: "Test Door" });
    expect(gallery.items[0]?.mainImageId).toBe(img2.id);
    const obj = await products.readProductImage(ctx, img2.id);
    expect(obj.body.equals(PNG)).toBe(true);
    await expect(products.createProduct(ctx, { name: "Bad", categoryId: cat.id, minWidth: 1500, maxWidth: 600 })).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("stores attachments outside the DB and checks parent permission", async () => {
    const ctx = await adminCtx();
    const s = await suppliers.createSupplier(ctx, { name: "مورد الأخشاب" });
    const a = await attachments.uploadAttachment(ctx, { entityType: "supplier", entityId: s.id, fileName: "invoice.png" }, PNG);
    expect(a.storageKey).toContain(`supplier/${s.id}/`);
    const url = await attachments.attachmentUrl(ctx, a.id);
    expect(url).toMatch(/\/api\/v1\/files\/.+sig=/);
    const listed = await attachments.listAttachments(ctx, { entityType: "supplier", entityId: s.id });
    expect(listed).toHaveLength(1);
    await expect(attachments.uploadAttachment(ctx, { entityType: "supplier", entityId: s.id, fileName: "x.html" }, Buffer.from("<html>"))).rejects.toMatchObject({ code: "VALIDATION" });
  });
});
