import { AppError, documents } from "@edge/core";
import { createTranslator } from "@edge/i18n";
import { route } from "@/server/api";
import { htmlToPdf, renderDocumentHtml } from "@/server/documents";
import { log } from "@/server/log";

/**
 * GET /api/v1/documents/{type}/{id}?format=pdf|html
 * Permission checks happen in the document builders (same as viewing the record).
 */
export const GET = route<{ type: string; id: string }>(
  async ({ ctx, params, req }) => {
    const doc = await documents.buildDocument(ctx, params.type, params.id);
    const locale = (req.nextUrl.searchParams.get("lang") === "en" ? "en" : req.nextUrl.searchParams.get("lang") === "ar" ? "ar" : ctx.actor.locale);
    const t = createTranslator(locale);
    const format = req.nextUrl.searchParams.get("format") ?? "pdf";
    if (format === "html") {
      return new Response(renderDocumentHtml(doc, t, locale, { printButton: true }), {
        headers: { "content-type": "text/html; charset=utf-8", "cache-control": "private, no-store" },
      });
    }
    try {
      const pdf = await htmlToPdf(renderDocumentHtml(doc, t, locale));
      return new Response(new Uint8Array(pdf), {
        headers: {
          "content-type": "application/pdf",
          "content-disposition": `inline; filename="${doc.number}.pdf"`,
          "cache-control": "private, no-store",
        },
      });
    } catch (err) {
      log.error("pdf.failed", { type: params.type, error: err instanceof Error ? err.message : String(err) });
      throw new AppError("INTERNAL", "errors.pdfUnavailable");
    }
  },
  { rateLimit: { limit: 60, windowMs: 60_000 } },
);
