/**
 * Seed system.
 *  - Reference data (always, idempotent): permissions, default roles, units, production stages,
 *    expense categories, settings, and the initial Super Admin from SEED_ADMIN_* env vars.
 *  - Demo master data (only when SEED_DEMO_DATA=true): showroom, warehouses, materials, products.
 *    Demo data NEVER includes transactions — stock, sales and balances must come from real documents.
 * Production must run with SEED_DEMO_DATA=false.
 */
import path from "node:path";
import { config as loadEnv } from "dotenv";

loadEnv({ path: path.resolve(import.meta.dirname, "../../../.env") });

const { createDb } = await import("@edge/db");
const { ALL_PERMISSIONS, DEFAULT_ROLES } = await import("../src/auth/permissions");
const { hashPassword, assertPasswordPolicy } = await import("../src/auth/password");
const { DEFAULT_SETTINGS } = await import("../src/modules/settings");

const db = createDb(process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL);

async function seedPermissionsAndRoles() {
  for (const key of ALL_PERMISSIONS) {
    const [module, action] = key.split(".") as [string, string];
    await db.permission.upsert({ where: { key }, create: { key, module, action }, update: {} });
  }
  // Remove permissions no longer in the catalog (role links cascade).
  await db.permission.deleteMany({ where: { key: { notIn: ALL_PERMISSIONS } } });
  const perms = await db.permission.findMany();
  const idByKey = new Map(perms.map((p) => [p.key, p.id]));

  for (const r of DEFAULT_ROLES) {
    const existing = await db.role.findUnique({ where: { code: r.code } });
    if (existing) {
      // Existing roles may have been customised by admins — only SUPER_ADMIN is kept in sync.
      if (r.code !== "SUPER_ADMIN") continue;
    }
    const keys = r.permissions === "*" ? ALL_PERMISSIONS : r.permissions;
    const role = await db.role.upsert({
      where: { code: r.code },
      create: { code: r.code, nameAr: r.nameAr, nameEn: r.nameEn, dataScope: r.dataScope, isSystem: true },
      update: { nameAr: r.nameAr, nameEn: r.nameEn, dataScope: r.dataScope },
    });
    await db.rolePermission.deleteMany({ where: { roleId: role.id } });
    await db.rolePermission.createMany({
      data: [...new Set(keys)].map((k) => ({ roleId: role.id, permissionId: idByKey.get(k)! })),
      skipDuplicates: true,
    });
  }
}

async function seedReferenceData() {
  const units = [
    ["PCS", "قطعة", false], ["M", "متر", true], ["M2", "متر مربع", true], ["M3", "متر مكعب", true],
    ["KG", "كجم", true], ["G", "جرام", true], ["L", "لتر", true], ["BOX", "علبة", false], ["SHEET", "لوح", true],
  ] as const;
  for (const [code, name, allowDecimal] of units) {
    await db.unit.upsert({ where: { code }, create: { code, name, symbol: code, allowDecimal }, update: {} });
  }

  const stages = [
    ["CUTTING", "تقطيع", "Cutting", false], ["ASSEMBLY", "تجميع", "Assembly", false],
    ["SANDING", "صنفرة", "Sanding", false], ["PAINTING", "دهان", "Painting", false],
    ["HARDWARE", "تركيب الإكسسوارات", "Hardware Installation", false],
    ["FINAL_ASSEMBLY", "التجميع النهائي", "Final Assembly", false], ["QC", "مراقبة الجودة", "Quality Control", true],
  ] as const;
  for (const [i, [code, nameAr, nameEn, isQcStage]] of stages.entries()) {
    await db.productionStage.upsert({
      where: { code },
      create: { code, nameAr, nameEn, sequence: (i + 1) * 10, isQcStage },
      update: {},
    });
  }

  const expenseCategories = [
    ["ELECTRICITY", "كهرباء", false], ["TRANSPORT", "نقل", false], ["MAINTENANCE", "صيانة", true],
    ["SALARIES", "رواتب", false], ["RENT", "إيجار", false], ["OTHER", "أخرى", false],
  ] as const;
  for (const [code, name, isProductionCost] of expenseCategories) {
    await db.expenseCategory.upsert({ where: { code }, create: { code, name, isProductionCost }, update: {} });
  }

  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await db.systemSetting.upsert({ where: { key }, create: { key, value: value as never }, update: {} });
  }
}

async function seedAdmin() {
  const username = (process.env.SEED_ADMIN_USERNAME ?? "admin").toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (await db.user.findUnique({ where: { username } })) return;
  if (!password) throw new Error("SEED_ADMIN_PASSWORD must be set to create the initial admin");
  assertPasswordPolicy(password);
  const role = await db.role.findUniqueOrThrow({ where: { code: "SUPER_ADMIN" } });
  await db.$transaction(async (tx) => {
    const seq = await tx.$queryRaw<{ last_value: number }[]>`
      INSERT INTO document_sequences (key, period, last_value, updated_at) VALUES ('EMP', 0, 1, now())
      ON CONFLICT (key, period) DO UPDATE SET last_value = document_sequences.last_value + 1, updated_at = now()
      RETURNING last_value`;
    await tx.user.create({
      data: {
        code: `EMP-${String(seq[0]!.last_value).padStart(6, "0")}`,
        fullName: "System Administrator",
        username,
        email: process.env.SEED_ADMIN_EMAIL || null,
        passwordHash: await hashPassword(password),
        mustChangePassword: process.env.NODE_ENV === "production",
        roles: { create: [{ roleId: role.id }] },
      },
    });
  });
  console.log(`Created super admin "${username}"`);
}

async function seedDemo() {
  const showroom = await db.showroom.upsert({
    where: { code: "SR-01" },
    create: { code: "SR-01", name: "المعرض الرئيسي", address: "القاهرة", phone: "0200000000" },
    update: {},
  });
  await db.cashAccount.upsert({ where: { code: "CASH-01" }, create: { code: "CASH-01", name: "خزينة المعرض الرئيسي", type: "CASH", showroomId: showroom.id }, update: {} });
  await db.cashAccount.upsert({ where: { code: "BANK-01" }, create: { code: "BANK-01", name: "الحساب البنكي", type: "BANK" }, update: {} });

  const warehouses = [
    ["WH-RAW", "Raw Materials Warehouse", "RAW_MATERIALS"], ["WH-ACC", "Accessories Warehouse", "ACCESSORIES"],
    ["WH-PAINT", "Paint Warehouse", "PAINT"], ["WH-FG", "Finished Products Warehouse", "FINISHED_PRODUCTS"],
  ] as const;
  for (const [code, name, type] of warehouses) {
    await db.warehouse.upsert({ where: { code }, create: { code, name, type }, update: {} });
  }

  const cats = [
    ["WOOD", "أخشاب", "RAW_MATERIAL"], ["BOARD", "ألواح", "RAW_MATERIAL"], ["VENEER", "قشرة", "RAW_MATERIAL"],
    ["CHEM", "غراء ومواد لاصقة", "OTHER"], ["PAINT", "دهانات", "PAINT"], ["HARDWARE", "إكسسوارات", "ACCESSORY"],
  ] as const;
  for (const [code, name, costCategory] of cats) {
    await db.materialCategory.upsert({ where: { code }, create: { code, name, costCategory }, update: {} });
  }
  const cat = async (code: string) => (await db.materialCategory.findUniqueOrThrow({ where: { code } })).id;
  const unit = async (code: string) => (await db.unit.findUniqueOrThrow({ where: { code } })).id;

  const materials = [
    ["MAT-0001", "خشب زان", "WOOD", "M3", 0.5], ["MAT-0002", "خشب موسكي", "WOOD", "M3", 0.5],
    ["MAT-0003", "MDF 18 مم", "BOARD", "M2", 50], ["MAT-0004", "HDF", "BOARD", "M2", 50],
    ["MAT-0005", "قشرة بلوط", "VENEER", "M2", 40], ["MAT-0006", "غراء خشب", "CHEM", "KG", 10],
    ["MAT-0007", "دهان", "PAINT", "L", 20], ["MAT-0008", "مفصلات", "HARDWARE", "PCS", 100],
    ["MAT-0009", "كالون", "HARDWARE", "PCS", 30],
  ] as const;
  for (const [code, name, c, u, reorder] of materials) {
    await db.material.upsert({
      where: { code },
      create: { code, name, categoryId: await cat(c), unitId: await unit(u), reorderLevel: reorder, minStock: reorder / 2 },
      update: {},
    });
  }

  const pcats = [["CLASSIC", "Classic"], ["MODERN", "Modern"], ["LUXURY", "Luxury"]] as const;
  for (const [i, [code, name]] of pcats.entries()) {
    await db.productCategory.upsert({ where: { code }, create: { code, name, sortOrder: i }, update: {} });
  }
  const pcat = async (code: string) => (await db.productCategory.findUniqueOrThrow({ where: { code } })).id;
  const products = [
    ["DR-0001", "Modern Classic", "CLASSIC"], ["DR-0002", "Royal Classic", "CLASSIC"], ["DR-0003", "Modern Line", "MODERN"],
    ["DR-0004", "Luxury Wood", "LUXURY"], ["DR-0005", "Classic Panel", "CLASSIC"],
  ] as const;
  for (const [code, name, c] of products) {
    await db.product.upsert({
      where: { code },
      create: {
        code, name, categoryId: await pcat(c), status: "ACTIVE", pricingMethod: "PER_UNIT",
        defaultWidth: 900, defaultHeight: 2100, defaultThickness: 45,
        minWidth: 600, maxWidth: 1400, minHeight: 1800, maxHeight: 2800,
      },
      update: {},
    });
  }
  console.log("Demo master data loaded (no transactions).");
}

try {
  await seedPermissionsAndRoles();
  await seedReferenceData();
  await seedAdmin();
  if (process.env.SEED_DEMO_DATA === "true") {
    if (process.env.NODE_ENV === "production") throw new Error("Refusing to load demo data with NODE_ENV=production");
    await seedDemo();
  }
  console.log("Seed complete.");
} finally {
  await db.$disconnect();
}
