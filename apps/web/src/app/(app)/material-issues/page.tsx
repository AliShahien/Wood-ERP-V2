import Link from "next/link";
import { can, manufacturing } from "@edge/core";
import { formatDate } from "@edge/i18n";
import { Forbidden } from "@/components/forbidden";
import { ListToolbar } from "@/components/list-toolbar";
import { Pagination } from "@/components/pagination";
import { StatusBadge } from "@/components/status-badge";
import { Card, EmptyState, Num, PageHeader, Table, Td, Th, Tr } from "@/components/ui/primitives";
import { getT } from "@/server/i18n";
import { requirePageContext } from "@/server/session";

export default async function MaterialIssuesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requirePageContext();
  const { t, locale } = await getT();
  if (!can(ctx.actor, "material_issues.view")) return <Forbidden t={t} />;
  const sp = await searchParams;
  const data = await manufacturing.listMaterialIssues(ctx, { page: sp.page, q: sp.q, status: sp.status || undefined, type: sp.type || undefined });
  return (
    <>
      <PageHeader title={t("materialIssues.title")} />
      <Card>
        <ListToolbar t={t} sp={sp} filters={[
          { name: "status", options: ["DRAFT", "POSTED", "REVERSED", "CANCELLED"].map((s) => ({ value: s, label: t(`status.DocStatus.${s}`) })) },
          { name: "type", options: ["ISSUE", "RETURN"].map((s) => ({ value: s, label: t(`status.MaterialIssueType.${s}`) })) },
        ]} />
        {data.items.length === 0 ? <EmptyState title={t("common.noResults")} /> : (
          <Table>
            <thead><tr className="border-b"><Th>{t("common.code")}</Th><Th>{t("materialIssues.type")}</Th><Th>{t("docs.manufacturingOrderRef")}</Th><Th>{t("materialIssues.warehouse")}</Th><Th>{t("materialIssues.lines")}</Th><Th>{t("common.createdAt")}</Th><Th>{t("common.status")}</Th></tr></thead>
            <tbody>
              {data.items.map((m) => (
                <Tr key={m.id}>
                  <Td><Link href={`/material-issues/${m.id}`} className="num font-medium hover:underline">{m.number}</Link></Td>
                  <Td><StatusBadge t={t} group="MaterialIssueType" value={m.type} /></Td>
                  <Td><Link href={`/manufacturing/${m.manufacturingOrder.id}`} className="num hover:underline">{m.manufacturingOrder.number}</Link></Td>
                  <Td>{m.warehouse.name}</Td>
                  <Td><Num>{m._count.items}</Num></Td>
                  <Td><Num>{formatDate(locale, m.issueDate)}</Num></Td>
                  <Td><StatusBadge t={t} group="DocStatus" value={m.status} /></Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
        <Pagination t={t} page={data.page} pageCount={data.pageCount} total={data.total} searchParams={sp} basePath="/material-issues" />
      </Card>
    </>
  );
}
