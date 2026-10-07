import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { PermissionKey } from "../auth/permissions";
import { assertInShowroomScope, requirePermission, type ServiceContext } from "../context";
import { AppError, notFound } from "../errors";
import { audit } from "../platform/audit";
import { bucketName, DOCUMENT_MIMES, getStorage, validateUpload, type Bucket } from "../platform/storage";
import { parse, uuid } from "../validation";

/** Which records can carry attachments, where they go, and which permission lets you see them. */
export const ATTACHABLE: Record<string, { bucket: Bucket; view: PermissionKey; table: string }> = {
  customer: { bucket: "customers", view: "customers.view", table: "customer" },
  supplier: { bucket: "attachments", view: "suppliers.view", table: "supplier" },
  product: { bucket: "products", view: "products.view", table: "product" },
  quotation: { bucket: "documents", view: "quotations.view", table: "quotation" },
  measurement: { bucket: "measurements", view: "measurements.view", table: "measurement" },
  sales_order: { bucket: "documents", view: "sales_orders.view", table: "salesOrder" },
  manufacturing_order: { bucket: "manufacturing", view: "manufacturing.view", table: "manufacturingOrder" },
  quality_check: { bucket: "manufacturing", view: "quality.view", table: "qualityCheck" },
  purchase_order: { bucket: "documents", view: "purchases.view", table: "purchaseOrder" },
  goods_receipt: { bucket: "documents", view: "goods_receipts.view", table: "goodsReceipt" },
  expense: { bucket: "documents", view: "expenses.view", table: "expense" },
  delivery: { bucket: "delivery", view: "deliveries.view", table: "delivery" },
};

const entityType = z.enum(Object.keys(ATTACHABLE) as [string, ...string[]]);

/** Showroom-bound parents: attachments inherit the parent's data scope. */
const SCOPED: Record<string, (ctx: ServiceContext, id: string) => Promise<{ showroomId: string | null; createdById: string | null; salespersonId?: string | null } | null>> = {
  customer: (ctx, id) => ctx.db.customer.findUnique({ where: { id }, select: { showroomId: true, createdById: true } }),
  quotation: (ctx, id) => ctx.db.quotation.findUnique({ where: { id }, select: { showroomId: true, createdById: true, salespersonId: true } }),
  sales_order: (ctx, id) => ctx.db.salesOrder.findUnique({ where: { id }, select: { showroomId: true, createdById: true, salespersonId: true } }),
  measurement: async (ctx, id) => {
    const m = await ctx.db.measurement.findUnique({ where: { id }, select: { createdById: true, measuredById: true, customer: { select: { showroomId: true } } } });
    return m ? { showroomId: m.customer.showroomId, createdById: m.createdById, salespersonId: m.measuredById } : null;
  },
  delivery: async (ctx, id) => {
    const d = await ctx.db.delivery.findUnique({ where: { id }, select: { salesOrder: { select: { showroomId: true, createdById: true, salespersonId: true } } } });
    return d ? d.salesOrder : null;
  },
};

async function assertEntity(ctx: ServiceContext, type: string, id: string) {
  const def = ATTACHABLE[type];
  if (!def) throw new AppError("VALIDATION", "errors.validation");
  requirePermission(ctx, def.view);
  const scoped = SCOPED[type];
  if (scoped) {
    const rec = await scoped(ctx, id);
    if (!rec) throw notFound(type);
    assertInShowroomScope(ctx.actor, rec);
    return def;
  }
  const model = (ctx.db as unknown as Record<string, { findUnique: (a: unknown) => Promise<unknown> }>)[def.table];
  const row = await model!.findUnique({ where: { id }, select: { id: true } });
  if (!row) throw notFound(type);
  return def;
}

export async function listAttachments(ctx: ServiceContext, input: unknown) {
  requirePermission(ctx, "attachments.view");
  const q = parse(z.object({ entityType, entityId: uuid }), input);
  await assertEntity(ctx, q.entityType, q.entityId);
  return ctx.db.attachment.findMany({
    where: { entityType: q.entityType, entityId: q.entityId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    select: { id: true, fileName: true, mimeType: true, sizeBytes: true, category: true, description: true, createdAt: true },
  });
}

export const uploadMetaSchema = z.object({
  entityType,
  entityId: uuid,
  category: z.enum(["IMAGE", "PHOTO", "DRAWING", "SIGNATURE", "DOCUMENT", "OTHER"]).default("DOCUMENT"),
  description: z.string().trim().max(300).optional(),
  fileName: z.string().trim().min(1).max(200),
});

export async function uploadAttachment(ctx: ServiceContext, meta: unknown, body: Buffer) {
  requirePermission(ctx, "attachments.upload");
  const m = parse(uploadMetaSchema, meta);
  const def = await assertEntity(ctx, m.entityType, m.entityId);
  const { mime, ext } = validateUpload(body, DOCUMENT_MIMES);
  const bucket = bucketName(def.bucket);
  const key = `${m.entityType}/${m.entityId}/${randomUUID()}.${ext}`;
  await getStorage().put(bucket, key, body, mime);
  try {
    return await ctx.db.$transaction(async (tx) => {
      const a = await tx.attachment.create({
        data: {
          entityType: m.entityType, entityId: m.entityId, category: m.category, bucket, storageKey: key,
          fileName: m.fileName.replace(/[^\p{L}\p{N}._ -]/gu, "_"), mimeType: mime, sizeBytes: body.length,
          description: m.description ?? null, createdById: ctx.actor.userId,
        },
      });
      await audit(tx, ctx, { action: "attachment.upload", entityType: m.entityType, entityId: m.entityId, newValues: { attachmentId: a.id, fileName: a.fileName } });
      return a;
    });
  } catch (err) {
    await getStorage().remove(bucket, key); // no orphan objects
    throw err;
  }
}

/** Returns a short-lived signed URL after checking the caller may view the parent record. */
export async function attachmentUrl(ctx: ServiceContext, id: string) {
  requirePermission(ctx, "attachments.view");
  const a = await ctx.db.attachment.findFirst({ where: { id, deletedAt: null } });
  if (!a) throw notFound("attachment");
  await assertEntity(ctx, a.entityType, a.entityId);
  return getStorage().signedUrl(a.bucket, a.storageKey, 300);
}

/** Soft delete — the object is kept for audit/recovery. */
export async function deleteAttachment(ctx: ServiceContext, id: string) {
  requirePermission(ctx, "attachments.delete");
  const a = await ctx.db.attachment.findFirst({ where: { id, deletedAt: null } });
  if (!a) throw notFound("attachment");
  await assertEntity(ctx, a.entityType, a.entityId);
  await ctx.db.$transaction(async (tx) => {
    await tx.attachment.update({ where: { id }, data: { deletedAt: new Date(), deletedById: ctx.actor.userId } });
    await audit(tx, ctx, { action: "attachment.delete", entityType: a.entityType, entityId: a.entityId, oldValues: { attachmentId: id, fileName: a.fileName } });
  });
}
