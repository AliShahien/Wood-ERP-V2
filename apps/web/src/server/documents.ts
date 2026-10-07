import "server-only";
import type { DocModel } from "@edge/core";
import { dirOf, formatDate, formatNumber, type Locale, type Translator } from "@edge/i18n";

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Returns escaped HTML; dates, numbers and document codes are LTR-isolated. */
function fmt(locale: Locale, t: Translator, v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  const ltr = (s: string) => `<span class="num">${esc(s)}</span>`;
  if (v instanceof Date) return ltr(formatDate(locale, v));
  if (typeof v === "number") return ltr(String(v));
  const s = String(v);
  if (s.startsWith("status.")) return esc(t(s));
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return ltr(formatDate(locale, s));
  if (/^[A-Z]{2,5}-[\d-]+(-R\d+)?$/.test(s)) return ltr(s);
  return esc(s);
}

/**
 * Renders a printable A4 HTML document. Arabic text is shaped by the browser/Chromium; numbers and
 * codes are isolated LTR. Fonts: IBM Plex Sans Arabic / Noto Sans Arabic (installed in the image),
 * falling back to system Arabic fonts.
 */
export function renderDocumentHtml(doc: DocModel, t: Translator, locale: Locale, opts: { printButton?: boolean } = {}): string {
  const dir = dirOf(locale);
  const cell = (c: DocModel["columns"][number], v: unknown) => {
    if (c.kind === "money" && typeof v === "number") return `<span class="num">${formatNumber(locale, v)}</span>`;
    if (c.kind === "qty" && typeof v === "number") return `<span class="num">${formatNumber(locale, v, Number.isInteger(v) ? 0 : 2)}</span>`;
    if (c.kind === "ltr") return `<span class="num">${esc(v)}</span>`;
    return esc(v).replace(/\n/g, "<br>");
  };
  return `<!doctype html>
<html lang="${locale}" dir="${dir}">
<head>
<meta charset="utf-8">
<title>${esc(t(doc.titleKey))} ${esc(doc.number)}</title>
<style>
  @page { size: A4; margin: 14mm 12mm; }
  * { box-sizing: border-box; }
  body { font-family: "IBM Plex Sans Arabic", "Noto Sans Arabic", "Noto Naskh Arabic", "Segoe UI", Tahoma, Arial, sans-serif; color: #2b2520; font-size: 12px; margin: 0; }
  .num { direction: ltr; unicode-bidi: isolate; font-variant-numeric: tabular-nums; }
  header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #7a4a2b; padding-bottom: 10px; margin-bottom: 14px; }
  .co-name { font-size: 20px; font-weight: 700; color: #7a4a2b; }
  .co-info { color: #6b6158; line-height: 1.6; }
  .title { text-align: end; }
  .title h1 { margin: 0; font-size: 22px; }
  .title .number { font-size: 14px; font-weight: 600; margin-top: 4px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 14px; }
  .box { border: 1px solid #e3dcd4; border-radius: 6px; padding: 8px 10px; }
  .box h3 { margin: 0 0 4px; font-size: 11px; color: #8a7f75; font-weight: 500; }
  .party { font-weight: 600; font-size: 14px; }
  .meta { display: grid; grid-template-columns: auto 1fr; gap: 3px 10px; }
  .meta dt { color: #8a7f75; }
  .meta dd { margin: 0; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
  th { background: #f4efe9; font-weight: 600; text-align: start; padding: 6px 8px; border-bottom: 1px solid #d9cfc4; font-size: 11px; }
  td { padding: 6px 8px; border-bottom: 1px solid #eee7df; vertical-align: top; }
  .end { text-align: end; }
  .totals { margin-inline-start: auto; width: 48%; }
  .totals td { border: none; padding: 3px 8px; }
  .totals .strong td { font-weight: 700; font-size: 13px; border-top: 1px solid #d9cfc4; }
  .notes { white-space: pre-line; border: 1px dashed #d9cfc4; border-radius: 6px; padding: 8px 10px; margin-top: 8px; }
  .signs { display: flex; gap: 40px; margin-top: 40px; }
  .signs div { flex: 1; border-top: 1px solid #999; padding-top: 6px; text-align: center; color: #6b6158; }
  .toolbar { position: fixed; inset-inline-end: 16px; top: 16px; }
  .toolbar button { font: inherit; padding: 8px 16px; border-radius: 6px; border: 0; background: #7a4a2b; color: #fff; cursor: pointer; }
  footer { margin-top: 18px; color: #a0968c; font-size: 10px; text-align: center; }
  @media print { .toolbar { display: none; } }
</style>
</head>
<body>
${opts.printButton ? `<div class="toolbar"><button onclick="window.print()">${esc(t("docs.print"))}</button></div>` : ""}
<header>
  <div>
    <div class="co-name">${esc(doc.company.name)}</div>
    <div class="co-info">${[
      doc.company.address ? esc(doc.company.address) : "",
      doc.company.phone ? `<span class="num">${esc(doc.company.phone)}</span>` : "",
      doc.company.email ? `<span class="num">${esc(doc.company.email)}</span>` : "",
      doc.company.taxNumber ? `${esc(t("fields.taxNumber"))}: <span class="num">${esc(doc.company.taxNumber)}</span>` : "",
    ].filter(Boolean).join("<br>")}</div>
  </div>
  <div class="title">
    <h1>${esc(t(doc.titleKey))}</h1>
    <div class="number num">${esc(doc.number)}</div>
    <div class="num">${esc(formatDate(locale, doc.date))}</div>
  </div>
</header>
<div class="grid">
  ${doc.party ? `<div class="box"><h3>${esc(t(doc.party.labelKey))}</h3><div class="party">${esc(doc.party.name)}</div>${doc.party.lines.map((l) => `<div>${esc(l)}</div>`).join("")}</div>` : "<div></div>"}
  <div class="box"><dl class="meta">${doc.meta.map((m) => `<dt>${esc(t(m.labelKey))}</dt><dd>${fmt(locale, t, m.value)}</dd>`).join("")}</dl></div>
</div>
<table>
  <thead><tr>${doc.columns.map((c) => `<th class="${c.align === "end" ? "end" : ""}">${esc(t(c.labelKey))}</th>`).join("")}</tr></thead>
  <tbody>${doc.rows.map((r) => `<tr>${doc.columns.map((c) => `<td class="${c.align === "end" ? "end" : ""}">${cell(c, r[c.key])}</td>`).join("")}</tr>`).join("")}</tbody>
</table>
${doc.totals.length ? `<table class="totals"><tbody>${doc.totals.map((x) => `<tr class="${x.strong ? "strong" : ""}"><td>${esc(t(x.labelKey))}</td><td class="end"><span class="num">${esc(formatNumber(locale, x.value))}</span> ${esc(doc.currency)}</td></tr>`).join("")}</tbody></table>` : ""}
${doc.notes ? `<div class="notes"><strong>${esc(t("fields.notes"))}:</strong><br>${esc(doc.notes)}</div>` : ""}
<div class="signs">${doc.signatures.map((s) => `<div>${esc(t(s))}</div>`).join("")}</div>
<footer>${esc(doc.company.name)} · ${esc(t(doc.titleKey))} <span class="num">${esc(doc.number)}</span></footer>
</body>
</html>`;
}

// ───────────── PDF via headless Chromium ─────────────

type Browser = import("playwright-core").Browser;
let browserPromise: Promise<Browser> | null = null;

async function browser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = import("playwright-core").then(({ chromium }) =>
      chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"], executablePath: process.env.CHROMIUM_PATH || undefined }),
    );
    browserPromise.catch(() => {
      browserPromise = null;
    });
  }
  return browserPromise;
}

export async function htmlToPdf(html: string): Promise<Buffer> {
  const b = await browser();
  const page = await b.newPage();
  try {
    // No network: the document is self-contained.
    await page.route("**/*", (route) => (route.request().url().startsWith("data:") ? route.continue() : route.abort()));
    await page.setContent(html, { waitUntil: "load" });
    return await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true });
  } finally {
    await page.close();
  }
}
