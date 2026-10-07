import { z } from "zod";
import type { Db } from "@edge/db";
import { requirePermission, type ServiceContext } from "../context";
import { audit } from "../platform/audit";
import { parse } from "../validation";

/**
 * Typed system settings. Stored one row per key in `system_settings`.
 * Tax is OPTIONAL per document: `taxEnabledByDefault` + `defaultTaxRate` only pre-fill new
 * documents; the user decides on each quotation/invoice whether tax applies and at what rate.
 */
export const settingsSchema = z.object({
  "company.name": z.string().trim().max(200),
  "company.address": z.string().trim().max(500),
  "company.phone": z.string().trim().max(50),
  "company.email": z.string().trim().max(200),
  "company.taxNumber": z.string().trim().max(50),
  "company.logoAttachmentId": z.string().uuid().nullable(),
  "finance.currency": z.string().trim().length(3).toUpperCase(),
  "finance.taxEnabledByDefault": z.boolean(),
  "finance.defaultTaxRate": z.number().min(0).max(100),
  "sales.quotationValidityDays": z.number().int().min(1).max(365),
  "sales.defaultDepositPercent": z.number().min(0).max(100),
  "production.defaultOverheadPercent": z.number().min(0).max(500),
  "production.qcChecklist": z.array(z.string().trim().min(1).max(200)).max(50),
  "inventory.allowNegativeStock": z.literal(false),
});

export type Settings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: Settings = {
  "company.name": "Edge Wood",
  "company.address": "",
  "company.phone": "",
  "company.email": "",
  "company.taxNumber": "",
  "company.logoAttachmentId": null,
  "finance.currency": "EGP",
  "finance.taxEnabledByDefault": false,
  "finance.defaultTaxRate": 14,
  "sales.quotationValidityDays": 15,
  "sales.defaultDepositPercent": 50,
  "production.defaultOverheadPercent": 10,
  "production.qcChecklist": ["الأبعاد مطابقة", "جودة التشطيب", "تركيب الإكسسوارات", "خلو السطح من العيوب"],
  "inventory.allowNegativeStock": false,
};

/** Internal read (no permission check) — used by other services for defaults. */
export async function readSettings(db: Pick<Db, "systemSetting">): Promise<Settings> {
  const rows = await db.systemSetting.findMany();
  const stored = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const merged = { ...DEFAULT_SETTINGS, ...stored };
  const parsed = settingsSchema.safeParse(merged);
  return parsed.success ? parsed.data : DEFAULT_SETTINGS;
}

export async function getSettings(ctx: ServiceContext) {
  requirePermission(ctx, "settings.view");
  return readSettings(ctx.db);
}

export async function updateSettings(ctx: ServiceContext, input: unknown) {
  requirePermission(ctx, "settings.edit");
  const data = parse(settingsSchema.partial(), input);
  const before = await readSettings(ctx.db);
  await ctx.db.$transaction(async (tx) => {
    for (const [key, value] of Object.entries(data)) {
      await tx.systemSetting.upsert({
        where: { key },
        create: { key, value: value as never, updatedById: ctx.actor.userId },
        update: { value: value as never, updatedById: ctx.actor.userId },
      });
    }
    await audit(tx, ctx, {
      action: "settings.update",
      entityType: "settings",
      oldValues: Object.fromEntries(Object.keys(data).map((k) => [k, before[k as keyof Settings]])),
      newValues: data,
    });
  });
  return readSettings(ctx.db);
}
