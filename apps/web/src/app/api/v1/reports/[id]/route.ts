import { documents, reports, requirePermission } from "@edge/core";
import { createTranslator, formatDate } from "@edge/i18n";
import { route } from "@/server/api";
import { htmlToPdf } from "@/server/documents";
import { reportHtml, toCsv, toXlsx } from "@/server/export";

/** GET /api/v1/reports/{id}?from&to&showroomId...&format=json|csv|xlsx|pdf */
export const GET = route<{ id: string }>(
  async ({ ctx, params, req }) => {
    const sp = Object.fromEntries(req.nextUrl.searchParams);
    const { format = "json", ...filters } = sp;
    const res = await reports.runReport(ctx, params.id, filters);
    if (format === "json") return res;
    requirePermission(ctx, "reports.export");
    const locale = ctx.actor.locale;
    const t = createTranslator(locale);
    const title = t(res.titleKey);
    const file = `${params.id}-${new Date().toISOString().slice(0, 10)}`;
    if (format === "csv") {
      return new Response(toCsv(res, t, locale), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${file}.csv"` } });
    }
    if (format === "xlsx") {
      return new Response(new Uint8Array(await toXlsx(res, t, locale, title)), {
        headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "content-disposition": `attachment; filename="${file}.xlsx"` },
      });
    }
    const co = await documents.companyInfo(ctx);
    const sub = [res.filters.from ? formatDate(locale, res.filters.from) : null, res.filters.to ? formatDate(locale, res.filters.to) : null].filter(Boolean).join(" — ") || formatDate(locale, new Date());
    const pdf = await htmlToPdf(reportHtml(res, t, locale, title, sub, co.name));
    return new Response(new Uint8Array(pdf), { headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${file}.pdf"` } });
  },
  { rateLimit: { limit: 60, windowMs: 60_000 } },
);
