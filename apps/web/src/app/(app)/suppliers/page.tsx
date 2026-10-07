import Link from "next/link";
import { Plus } from "@/components/ui/material-icons";
import { can, suppliers } from "@edge/core";
import { Forbidden } from "@/components/forbidden";
import { ListToolbar, statusFilter } from "@/components/list-toolbar";
import { Pagination } from "@/components/pagination";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, Num, PageHeader, Table, Td, Th, Tr } from "@/components/ui/primitives";
import { getT } from "@/server/i18n";
import { requirePageContext } from "@/server/session";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t("suppliers.title") };
}

export default async function SuppliersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requirePageContext();
  const { t } = await getT();
  if (!can(ctx.actor, "suppliers.view")) return <Forbidden t={t} />;
  const sp = await searchParams;
  const data = await suppliers.listSuppliers(ctx, { page: sp.page, q: sp.q, status: sp.status || undefined });
  return (
    <>
      <PageHeader title={t("suppliers.title")} actions={can(ctx.actor, "suppliers.create") ? <Button asChild><Link href="/suppliers/new"><Plus />{t("suppliers.new")}</Link></Button> : null} />
      <Card>
        <ListToolbar t={t} sp={sp} filters={[statusFilter(t)]} />
        {data.items.length === 0 ? <EmptyState title={t("common.noResults")} hint={t("common.noResultsHint")} /> : (
          <Table>
            <thead><tr className="border-b">
              <Th>{t("common.code")}</Th><Th>{t("common.name")}</Th><Th>{t("fields.contactPerson")}</Th><Th>{t("fields.phone")}</Th><Th>{t("fields.email")}</Th><Th>{t("common.status")}</Th>
            </tr></thead>
            <tbody>
              {data.items.map((s) => (
                <Tr key={s.id}>
                  <Td><Num className="text-muted-foreground">{s.code}</Num></Td>
                  <Td><Link href={`/suppliers/${s.id}`} className="font-medium hover:underline">{s.name}</Link></Td>
                  <Td>{s.contactPerson ?? "—"}</Td>
                  <Td><Num>{s.phone ?? "—"}</Num></Td>
                  <Td><Num>{s.email ?? "—"}</Num></Td>
                  <Td><StatusBadge t={t} group="RecordStatus" value={s.status} /></Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
        <Pagination t={t} page={data.page} pageCount={data.pageCount} total={data.total} searchParams={sp} basePath="/suppliers" />
      </Card>
    </>
  );
}
