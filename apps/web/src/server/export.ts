import "server-only";
import type { ReportResult } from "@edge/core";
import { dirOf, formatDate, formatNumber, type Locale, type Translator } from "@edge/i18n";

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function cellText(t: Translator, locale: Locale, col: ReportResult["columns"][number], v: unknown): string {
  if (v === null || v === undefined) return "";
  if (col.kind === "date") return formatDate(locale, v as Date);
  if (col.kind === "status" && col.statusGroup) return t(`status.${col.statusGroup}.${v}`);
  return String(v);
}

/** CSV with UTF-8 BOM so Excel opens Arabic correctly. Numbers are raw (no thousand separators). */
export function toCsv(r: ReportResult, t: Translator, locale: Locale): string {
  const q = (s: string) => (/[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const lines = [r.columns.map((c) => q(t(c.labelKey))).join(",")];
  for (const row of r.rows) lines.push(r.columns.map((c) => q(cellText(t, locale, c, row[c.key]))).join(","));
  if (r.totals) lines.push(r.columns.map((c, i) => (i === 0 ? q(t("docs.total")) : c.key in r.totals! ? String(r.totals![c.key]) : "")).join(","));
  return `﻿${lines.join("\r\n")}`;
}

export async function toXlsx(r: ReportResult, t: Translator, locale: Locale, title: string): Promise<Buffer> {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "Edge Wood ERP";
  const ws = wb.addWorksheet(title.slice(0, 30), { views: [{ rightToLeft: locale === "ar", state: "frozen", ySplit: 1 }] });
  ws.columns = r.columns.map((c) => ({ header: t(c.labelKey), key: c.key, width: c.kind === "money" || c.kind === "qty" ? 16 : 24 }));
  ws.getRow(1).font = { bold: true };
  for (const row of r.rows) {
    ws.addRow(Object.fromEntries(r.columns.map((c) => {
      const v = row[c.key];
      if (c.kind === "money" || c.kind === "qty") return [c.key, v === null ? null : Number(v)];
      if (c.kind === "date") return [c.key, v ? new Date(v as Date) : null];
      return [c.key, cellText(t, locale, c, v)];
    })));
  }
  r.columns.forEach((c, i) => {
    if (c.kind === "money") ws.getColumn(i + 1).numFmt = "#,##0.00";
    if (c.kind === "qty") ws.getColumn(i + 1).numFmt = "#,##0.###";
    if (c.kind === "date") ws.getColumn(i + 1).numFmt = "dd/mm/yyyy";
  });
  if (r.totals) {
    const tr = ws.addRow(Object.fromEntries(r.columns.map((c, i) => [c.key, i === 0 ? t("docs.total") : r.totals![c.key] ?? null])));
    tr.font = { bold: true };
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export function reportHtml(r: ReportResult, t: Translator, locale: Locale, title: string, subtitle: string, company: string): string {
  const dir = dirOf(locale);
  const fmt = (c: ReportResult["columns"][number], v: unknown) => {
    if (v === null || v === undefined || v === "") return "";
    if (c.kind === "money") return `<span class="num">${formatNumber(locale, Number(v))}</span>`;
    if (c.kind === "qty") return `<span class="num">${formatNumber(locale, Number(v), Number.isInteger(Number(v)) ? 0 : 2)}</span>`;
    if (c.kind === "date" || c.kind === "ltr") return `<span class="num">${esc(cellText(t, locale, c, v))}</span>`;
    return esc(cellText(t, locale, c, v));
  };
  const end = (c: ReportResult["columns"][number]) => (c.kind === "money" || c.kind === "qty" ? "end" : "");
  return `<!doctype html><html lang="${locale}" dir="${dir}"><head><meta charset="utf-8"><title>${esc(title)}</title><style>
  @page { size: A4 landscape; margin: 10mm; }
  body { font-family: "IBM Plex Sans Arabic","Noto Sans Arabic","Segoe UI",Tahoma,Arial,sans-serif; font-size: 10.5px; color: #2b2520; }
  .num { direction: ltr; unicode-bidi: isolate; font-variant-numeric: tabular-nums; }
  h1 { font-size: 16px; margin: 0; } .sub { color: #7a6f65; margin: 4px 0 10px; }
  table { width: 100%; border-collapse: collapse; } th { background: #f4efe9; text-align: start; padding: 5px 6px; border-bottom: 1px solid #d9cfc4; }
  td { padding: 4px 6px; border-bottom: 1px solid #eee7df; } .end { text-align: end; } tfoot td { font-weight: 700; border-top: 1px solid #999; }
  </style></head><body>
  <h1>${esc(company)} — ${esc(title)}</h1><p class="sub">${esc(subtitle)}</p>
  <table><thead><tr>${r.columns.map((c) => `<th class="${end(c)}">${esc(t(c.labelKey))}</th>`).join("")}</tr></thead>
  <tbody>${r.rows.map((row) => `<tr>${r.columns.map((c) => `<td class="${end(c)}">${fmt(c, row[c.key])}</td>`).join("")}</tr>`).join("")}</tbody>
  ${r.totals ? `<tfoot><tr>${r.columns.map((c, i) => `<td class="${end(c)}">${i === 0 ? esc(t("docs.total")) : c.key in r.totals! ? fmt(c, r.totals![c.key]) : ""}</td>`).join("")}</tr></tfoot>` : ""}
  </table></body></html>`;
}
