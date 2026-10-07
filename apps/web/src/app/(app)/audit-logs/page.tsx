import { auditLogs, can } from "@edge/core";
import { formatDate } from "@edge/i18n";
import { Search } from "@/components/ui/material-icons";
import { Forbidden } from "@/components/forbidden";
import { Pagination } from "@/components/pagination";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, Input, Num, PageHeader, Table, Td, Th, Tr } from "@/components/ui/primitives";
import { getT } from "@/server/i18n";
import { requirePageContext } from "@/server/session";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t("audit.title") };
}

function JsonCell({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <span className="text-muted-foreground">—</span>;
  return (
    <pre dir="ltr" className="max-w-xs overflow-x-auto whitespace-pre-wrap break-words rounded bg-muted px-2 py-1 text-start text-[11px] leading-relaxed">
      {JSON.stringify(value, null, 1)}
    </pre>
  );
}

export default async function AuditLogsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requirePageContext();
  const { t, locale } = await getT();
  if (!can(ctx.actor, "audit_logs.view")) return <Forbidden t={t} />;
  const sp = await searchParams;
  const data = await auditLogs.listAuditLogs(ctx, { page: sp.page, q: sp.q, entityType: sp.entityType || undefined, pageSize: 30 });
  return (
    <>
      <PageHeader title={t("audit.title")} />
      <Card>
        <form className="flex flex-wrap gap-2 border-b p-3" role="search">
          <div className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute start-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input name="q" defaultValue={sp.q} placeholder={t("common.searchPlaceholder")} className="ps-8" />
          </div>
          <Button type="submit" variant="secondary">{t("common.filter")}</Button>
        </form>
        {data.items.length === 0 ? (
          <EmptyState title={t("common.noResults")} />
        ) : (
          <Table>
            <thead>
              <tr className="border-b">
                <Th>{t("audit.time")}</Th>
                <Th>{t("audit.user")}</Th>
                <Th>{t("audit.action")}</Th>
                <Th>{t("audit.entity")}</Th>
                <Th>{t("audit.old")}</Th>
                <Th>{t("audit.new")}</Th>
                <Th>{t("users.ip")}</Th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((row) => (
                <Tr key={row.id} className="align-top">
                  <Td className="whitespace-nowrap"><Num>{formatDate(locale, row.createdAt, true)}</Num></Td>
                  <Td>{row.user?.fullName ?? t("audit.system")}</Td>
                  <Td><Num className="font-mono text-xs">{row.action}</Num></Td>
                  <Td>
                    <span className="text-muted-foreground">{row.entityType}</span>{" "}
                    {row.entityNumber ? <Num className="font-medium">{row.entityNumber}</Num> : null}
                  </Td>
                  <Td><JsonCell value={row.oldValues} /></Td>
                  <Td><JsonCell value={row.newValues} /></Td>
                  <Td><Num className="text-muted-foreground">{row.ip ?? "—"}</Num></Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
        <Pagination t={t} page={data.page} pageCount={data.pageCount} total={data.total} searchParams={sp} basePath="/audit-logs" />
      </Card>
    </>
  );
}
