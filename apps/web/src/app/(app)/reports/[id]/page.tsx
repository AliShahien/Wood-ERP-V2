import { notFound } from "next/navigation";
import { FileDown, FileSpreadsheet, FileText } from "@/components/ui/material-icons";
import { can, lookups, reports, warehouses } from "@edge/core";
import { formatDate, formatNumber } from "@edge/i18n";
import { Forbidden } from "@/components/forbidden";
import { Button } from "@/components/ui/button";
import { Card, CardContent, EmptyState, Field, Input, NativeSelect, Num, PageHeader, Table, Td, Th, Tr } from "@/components/ui/primitives";
import { getT } from "@/server/i18n";
import { requirePageContext } from "@/server/session";

export default async function ReportPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requirePageContext();
  const { t, locale } = await getT();
  if (!can(ctx.actor, "reports.view")) return <Forbidden t={t} />;
  const { id } = await params;
  const sp = await searchParams;
  const def = reports.availableReports(ctx).find((r) => r.id === id);
  if (!def) notFound();
  const filters = Object.fromEntries(Object.entries(sp).filter(([, v]) => v)) as Record<string, string>;
  const [res, showrooms, whs] = await Promise.all([
    reports.runReport(ctx, id, filters),
    def.filters.includes("showroom") && (ctx.actor.isSuperAdmin || ctx.actor.dataScope === "ALL") ? lookups.showroomOptions(ctx).catch(() => []) : Promise.resolve([]),
    def.filters.includes("warehouse") ? warehouses.listWarehouses(ctx, { pageSize: 100 }).then((r) => r.items).catch(() => []) : Promise.resolve([]),
  ]);
  const qs = new URLSearchParams(filters).toString();
  const cell = (kind: string | undefined, group: string | undefined, v: unknown) => {
    if (v === null || v === undefined || v === "") return "—";
    if (kind === "money") return <Num>{formatNumber(locale, Number(v))}</Num>;
    if (kind === "qty") return <Num>{formatNumber(locale, Number(v), Number.isInteger(Number(v)) ? 0 : 2)}</Num>;
    if (kind === "date") return <Num>{formatDate(locale, v as Date)}</Num>;
    if (kind === "ltr") return <Num>{String(v)}</Num>;
    if (kind === "status" && group) return t(`status.${group}.${v}`);
    return String(v);
  };
  const end = (k?: string) => (k === "money" || k === "qty" ? "text-end" : "");
  return (
    <>
      <PageHeader
        title={t(res.titleKey)}
        description={t("reports.rows", { count: res.rows.length })}
        actions={can(ctx.actor, "reports.export") ? (
          <>
            <Button asChild variant="outline"><a href={`/api/v1/reports/${id}?${qs}&format=xlsx`}><FileSpreadsheet />Excel</a></Button>
            <Button asChild variant="outline"><a href={`/api/v1/reports/${id}?${qs}&format=csv`}><FileText />CSV</a></Button>
            <Button asChild variant="outline"><a href={`/api/v1/reports/${id}?${qs}&format=pdf`} target="_blank" rel="noopener"><FileDown />PDF</a></Button>
          </>
        ) : null}
      />
      {def.filters.length ? (
        <Card className="mb-4">
          <CardContent className="pt-4">
            <form className="flex flex-wrap items-end gap-3">
              {def.filters.includes("date") ? (
                <>
                  <Field label={t("reports.from")}><Input type="date" name="from" defaultValue={sp.from} dir="ltr" /></Field>
                  <Field label={t("reports.to")}><Input type="date" name="to" defaultValue={sp.to} dir="ltr" /></Field>
                </>
              ) : null}
              {showrooms.length ? (
                <Field label={t("fields.showroom")}>
                  <NativeSelect name="showroomId" defaultValue={sp.showroomId ?? ""} className="w-48"><option value="">{t("common.all")}</option>{showrooms.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</NativeSelect>
                </Field>
              ) : null}
              {whs.length ? (
                <Field label={t("nav.warehouses")}>
                  <NativeSelect name="warehouseId" defaultValue={sp.warehouseId ?? ""} className="w-48"><option value="">{t("common.all")}</option>{whs.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</NativeSelect>
                </Field>
              ) : null}
              <Button type="submit">{t("reports.run")}</Button>
            </form>
          </CardContent>
        </Card>
      ) : null}
      <Card>
        {res.truncated ? <p className="px-4 pt-3 text-sm text-warning">{t("reports.truncated")}</p> : null}
        {res.rows.length === 0 ? <EmptyState title={t("common.noResults")} /> : (
          <Table>
            <thead><tr className="border-b">{res.columns.map((c) => <Th key={c.key} className={end(c.kind)}>{t(c.labelKey)}</Th>)}</tr></thead>
            <tbody>
              {res.rows.map((row, i) => <Tr key={i}>{res.columns.map((c) => <Td key={c.key} className={end(c.kind)}>{cell(c.kind, c.statusGroup, row[c.key])}</Td>)}</Tr>)}
              {res.totals ? (
                <Tr className="bg-muted/60 font-semibold">
                  {res.columns.map((c, i) => <Td key={c.key} className={end(c.kind)}>{i === 0 ? t("docs.total") : c.key in res.totals! ? cell(c.kind, undefined, res.totals![c.key]) : ""}</Td>)}
                </Tr>
              ) : null}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
