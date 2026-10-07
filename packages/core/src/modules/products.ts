import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requirePermission, type ServiceContext } from "../context";
import { AppError, conflict, notFound } from "../errors";
import { audit, diff } from "../platform/audit";
import { nextNumber } from "../platform/numbering";
import { listQuerySchema, pageArgs, toPage } from "../platform/pagination";
import { searchWhere } from "../platform/query";
import { bucketName, getStorage, IMAGE_MIMES, validateUpload } from "../platform/storage";
import { optionalText, parse, recordStatus, requiredText, uuid } from "../validation";

const code = z.string().trim().toUpperCase().min(1).max(30).regex(/^[A-Z0-9_-]+$/);
const dim = z.coerce.number().positive().max(10000).nullable().optional();
const money = z.coerce.number().min(0).max(1e10);

// ───────────── Categories ─────────────

export const productCategorySchema = z.object({
  code, name: requiredText(100), parentId: uuid.nullable().optional(), sortOrder: z.coerce.number().int().default(0), status: recordStatus.default("ACTIVE"),
});

export async function listProductCategories(ctx: ServiceContext) {
  requirePermission(ctx, "products.view");
  return ctx.db.productCategory.findMany({
    where: { deletedAt: null },
    include: { _count: { select: { products: { where: { deletedAt: null } } } } },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}

export async function createProductCategory(ctx: ServiceContext, input: unknown) {
  requirePermission(ctx, "products.create");
  const data = parse(productCategorySchema, input);
  if (await ctx.db.productCategory.findUnique({ where: { code: data.code } })) throw conflict("errors.duplicate", { field: "code" });
  return ctx.db.$transaction(async (tx) => {
    const c = await tx.productCategory.create({ data: { ...data, parentId: data.parentId ?? null } });
    await audit(tx, ctx, { action: "product_category.create", entityType: "product_category", entityId: c.id, entityNumber: c.code, newValues: data });
    return c;
  });
}

export async function updateProductCategory(ctx: ServiceContext, id: string, input: unknown) {
  requirePermission(ctx, "products.edit");
  const data = parse(productCategorySchema.omit({ code: true }).partial(), input);
  const before = await ctx.db.productCategory.findFirst({ where: { id, deletedAt: null } });
  if (!before) throw notFound("product_category");
  return ctx.db.$transaction(async (tx) => {
    const c = await tx.productCategory.update({ where: { id }, data });
    const changes = diff(before as Record<string, unknown>, data);
    if (changes) await audit(tx, ctx, { action: "product_category.update", entityType: "product_category", entityId: id, entityNumber: before.code, ...changes });
    return c;
  });
}

// ───────────── Options catalog ─────────────

export const optionSchema = z.object({
  code,
  type: z.enum(["MATERIAL", "FINISH", "COLOR", "ACCESSORY", "OTHER"]),
  name: requiredText(150),
  priceMethod: z.enum(["FIXED_PER_UNIT", "PER_SQM", "PERCENT"]).default("FIXED_PER_UNIT"),
  priceAdjustment: z.coerce.number().min(-1e9).max(1e9).default(0),
  sortOrder: z.coerce.number().int().default(0),
  status: recordStatus.default("ACTIVE"),
});

export async function listOptions(ctx: ServiceContext, input: unknown = {}) {
  requirePermission(ctx, "products.view");
  const q = parse(z.object({ type: optionSchema.shape.type.optional(), status: recordStatus.optional() }), input);
  return ctx.db.productOption.findMany({
    where: { deletedAt: null, ...(q.type ? { type: q.type } : {}), ...(q.status ? { status: q.status } : {}) },
    orderBy: [{ type: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
  });
}

export async function createOption(ctx: ServiceContext, input: unknown) {
  requirePermission(ctx, "products.create");
  const data = parse(optionSchema, input);
  if (await ctx.db.productOption.findUnique({ where: { code: data.code } })) throw conflict("errors.duplicate", { field: "code" });
  return ctx.db.$transaction(async (tx) => {
    const o = await tx.productOption.create({ data });
    await audit(tx, ctx, { action: "product_option.create", entityType: "product_option", entityId: o.id, entityNumber: o.code, newValues: data });
    return o;
  });
}

export async function updateOption(ctx: ServiceContext, id: string, input: unknown) {
  requirePermission(ctx, "products.edit");
  const data = parse(optionSchema.omit({ code: true }).partial(), input);
  const before = await ctx.db.productOption.findFirst({ where: { id, deletedAt: null } });
  if (!before) throw notFound("product_option");
  return ctx.db.$transaction(async (tx) => {
    const o = await tx.productOption.update({ where: { id }, data });
    const changes = diff(before as Record<string, unknown>, data);
    if (changes) await audit(tx, ctx, { action: "product_option.update", entityType: "product_option", entityId: id, entityNumber: before.code, ...changes });
    return o;
  });
}

// ───────────── Products ─────────────

/** Product (door) names are English by business rule; stored as entered. Dimensions in mm. */
export const productSchema = z.object({
  code: code.optional().nullable(),
  name: requiredText(150),
  categoryId: uuid,
  description: optionalText(5000),
  status: z.enum(["DRAFT", "ACTIVE", "INACTIVE"]).default("DRAFT"),
  pricingMethod: z.enum(["PER_UNIT", "PER_SQM"]).default("PER_UNIT"),
  basePrice: money.default(0),
  defaultWidth: dim, defaultHeight: dim, defaultThickness: dim,
  minWidth: dim, maxWidth: dim, minHeight: dim, maxHeight: dim,
});

export const galleryQuerySchema = listQuerySchema.extend({
  categoryId: uuid.optional(),
  status: z.enum(["DRAFT", "ACTIVE", "INACTIVE"]).optional(),
  sort: z.enum(["name", "newest", "code"]).optional(),
  pageSize: z.coerce.number().int().min(1).max(60).default(24),
});

const cardSelect = {
  id: true, code: true, name: true, status: true, pricingMethod: true, basePrice: true, createdAt: true,
  category: { select: { id: true, name: true } },
  images: { where: { isMain: true }, select: { id: true }, take: 1 },
} as const;

/** Gallery listing: server-side filtering, sorting and pagination. Main image served by id. */
export async function listProducts(ctx: ServiceContext, input: unknown) {
  requirePermission(ctx, "products.view");
  const q = parse(galleryQuerySchema, input);
  // Users who cannot edit products only see the sellable catalog.
  const canManage = ctx.actor.isSuperAdmin || ctx.actor.permissions.has("products.edit");
  const status = canManage ? q.status : "ACTIVE";
  const where = {
    deletedAt: null,
    ...(status ? { status } : {}),
    ...(q.categoryId ? { categoryId: q.categoryId } : {}),
    ...searchWhere(q.q, ["name", "code", "description"]),
  };
  const sort = q.sort === "name" ? { name: "asc" as const } : q.sort === "code" ? { code: "asc" as const } : { createdAt: "desc" as const };
  const [items, total] = await Promise.all([
    ctx.db.product.findMany({ where, select: cardSelect, orderBy: sort, ...pageArgs(q) }),
    ctx.db.product.count({ where }),
  ]);
  return toPage(items.map(({ images, ...p }) => ({ ...p, mainImageId: images[0]?.id ?? null })), total, q);
}

export async function getProduct(ctx: ServiceContext, id: string) {
  requirePermission(ctx, "products.view");
  const p = await ctx.db.product.findFirst({
    where: { id, deletedAt: null },
    include: {
      category: { select: { id: true, name: true } },
      images: { orderBy: [{ isMain: "desc" }, { sortOrder: "asc" }], select: { id: true, isMain: true, sortOrder: true, altText: true } },
      availableOptions: { include: { option: true }, orderBy: { option: { sortOrder: "asc" } } },
      boms: { select: { id: true, version: true, name: true, status: true }, orderBy: { version: "desc" } },
    },
  });
  if (!p) throw notFound("product");
  const canManage = ctx.actor.isSuperAdmin || ctx.actor.permissions.has("products.edit");
  if (!canManage && p.status !== "ACTIVE") throw notFound("product");
  return p;
}

function assertDims(d: z.infer<typeof productSchema> | Partial<z.infer<typeof productSchema>>) {
  const bad = (min?: number | null, max?: number | null) => min != null && max != null && min > max;
  if (bad(d.minWidth, d.maxWidth) || bad(d.minHeight, d.maxHeight)) {
    throw new AppError("VALIDATION", "errors.validation", [{ path: "minWidth", code: "range" }]);
  }
}

export async function createProduct(ctx: ServiceContext, input: unknown) {
  requirePermission(ctx, "products.create");
  const data = parse(productSchema, input);
  assertDims(data);
  if (data.code && (await ctx.db.product.findUnique({ where: { code: data.code } }))) throw conflict("errors.duplicate", { field: "code" });
  return ctx.db.$transaction(async (tx) => {
    const finalCode = data.code || (await nextNumber(tx, "PRODUCT"));
    const p = await tx.product.create({ data: { ...data, code: finalCode, createdById: ctx.actor.userId } });
    await audit(tx, ctx, { action: "product.create", entityType: "product", entityId: p.id, entityNumber: finalCode, newValues: data });
    return p;
  });
}

export async function updateProduct(ctx: ServiceContext, id: string, input: unknown) {
  requirePermission(ctx, "products.edit");
  const data = parse(productSchema.omit({ code: true }).partial(), input);
  const before = await ctx.db.product.findFirst({ where: { id, deletedAt: null } });
  if (!before) throw notFound("product");
  assertDims({ ...(before as unknown as Record<string, number>), ...data });
  return ctx.db.$transaction(async (tx) => {
    const p = await tx.product.update({ where: { id }, data: { ...data, updatedById: ctx.actor.userId } });
    const changes = diff(before as Record<string, unknown>, data);
    if (changes) await audit(tx, ctx, { action: "product.update", entityType: "product", entityId: id, entityNumber: before.code, ...changes });
    return p;
  });
}

export async function deleteProduct(ctx: ServiceContext, id: string) {
  requirePermission(ctx, "products.delete");
  const p = await ctx.db.product.findFirst({ where: { id, deletedAt: null } });
  if (!p) throw notFound("product");
  if (await ctx.db.quotationItem.count({ where: { productId: id } })) throw new AppError("CONFLICT", "errors.productInUse");
  await ctx.db.$transaction(async (tx) => {
    await tx.product.update({ where: { id }, data: { deletedAt: new Date(), deletedById: ctx.actor.userId, status: "INACTIVE" } });
    await audit(tx, ctx, { action: "product.delete", entityType: "product", entityId: id, entityNumber: p.code });
  });
}

export const productOptionsSchema = z.object({
  options: z.array(z.object({ optionId: uuid, priceOverride: z.coerce.number().min(-1e9).max(1e9).nullable().optional(), isDefault: z.boolean().default(false) })).max(200),
});

/** Replaces the set of options available on a product. */
export async function setProductOptions(ctx: ServiceContext, productId: string, input: unknown) {
  requirePermission(ctx, "products.edit");
  const { options } = parse(productOptionsSchema, input);
  const p = await ctx.db.product.findFirst({ where: { id: productId, deletedAt: null }, include: { availableOptions: true } });
  if (!p) throw notFound("product");
  await ctx.db.$transaction(async (tx) => {
    await tx.productAvailableOption.deleteMany({ where: { productId } });
    if (options.length) {
      await tx.productAvailableOption.createMany({
        data: options.map((o) => ({ productId, optionId: o.optionId, priceOverride: o.priceOverride ?? null, isDefault: o.isDefault })),
      });
    }
    await audit(tx, ctx, {
      action: "product.options", entityType: "product", entityId: productId, entityNumber: p.code,
      oldValues: p.availableOptions.map((o) => o.optionId), newValues: options.map((o) => o.optionId),
    });
  });
  return getProduct(ctx, productId);
}

// ───────────── Images ─────────────

export async function uploadProductImage(ctx: ServiceContext, productId: string, body: Buffer, meta: { altText?: string } = {}) {
  requirePermission(ctx, "products.edit");
  const p = await ctx.db.product.findFirst({ where: { id: productId, deletedAt: null }, include: { _count: { select: { images: true } } } });
  if (!p) throw notFound("product");
  if (p._count.images >= 30) throw new AppError("VALIDATION", "errors.tooManyImages");
  const { mime, ext } = validateUpload(body, IMAGE_MIMES);
  const bucket = bucketName("products");
  const key = `${productId}/${randomUUID()}.${ext}`;
  await getStorage().put(bucket, key, body, mime);
  try {
    return await ctx.db.$transaction(async (tx) => {
      const img = await tx.productImage.create({
        data: { productId, bucket, storageKey: key, isMain: p._count.images === 0, sortOrder: p._count.images, altText: meta.altText ?? null, createdById: ctx.actor.userId },
      });
      await audit(tx, ctx, { action: "product.image_upload", entityType: "product", entityId: productId, entityNumber: p.code, newValues: { imageId: img.id } });
      return img;
    });
  } catch (err) {
    await getStorage().remove(bucket, key);
    throw err;
  }
}

export async function setMainImage(ctx: ServiceContext, productId: string, imageId: string) {
  requirePermission(ctx, "products.edit");
  const img = await ctx.db.productImage.findFirst({ where: { id: imageId, productId } });
  if (!img) throw notFound("image");
  await ctx.db.$transaction([
    ctx.db.productImage.updateMany({ where: { productId, isMain: true }, data: { isMain: false } }),
    ctx.db.productImage.update({ where: { id: imageId }, data: { isMain: true } }),
  ]);
}

export async function deleteProductImage(ctx: ServiceContext, productId: string, imageId: string) {
  requirePermission(ctx, "products.edit");
  const img = await ctx.db.productImage.findFirst({ where: { id: imageId, productId } });
  if (!img) throw notFound("image");
  await ctx.db.$transaction(async (tx) => {
    await tx.productImage.delete({ where: { id: imageId } });
    if (img.isMain) {
      const next = await tx.productImage.findFirst({ where: { productId }, orderBy: { sortOrder: "asc" } });
      if (next) await tx.productImage.update({ where: { id: next.id }, data: { isMain: true } });
    }
    await audit(tx, ctx, { action: "product.image_delete", entityType: "product", entityId: productId, oldValues: { imageId } });
  });
  await getStorage().remove(img.bucket, img.storageKey);
}

/** Streams an image after the products.view check (used by the image route; cacheable per id). */
export async function readProductImage(ctx: ServiceContext, imageId: string) {
  requirePermission(ctx, "products.view");
  const img = await ctx.db.productImage.findUnique({ where: { id: imageId } });
  if (!img) throw notFound("image");
  const obj = await getStorage().get(img.bucket, img.storageKey);
  if (!obj) throw notFound("image");
  return obj;
}
