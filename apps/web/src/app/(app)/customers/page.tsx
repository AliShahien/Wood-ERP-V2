import Link from "next/link";
import { Plus } from "@/components/ui/material-icons";
import { can, customers } from "@edge/core";
import { formatDate } from "@edge/i18n";
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
  return { title: t("customers.title") };
}

export default async function CustomersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requirePageContext();
  const { t, locale } = await getT();
  if (!can(ctx.actor, "customers.view")) return <Forbidden t={t} />;
  const sp = await searchParams;
  const data = await customers.listCustomers(ctx, { page: sp.page, q: sp.q, status: sp.status || undefined });
  return (
    <>
      <PageHeader
        title={t("customers.title")}
        actions={can(ctx.actor, "customers.create") ? <Button asChild><Link href="/customers/new"><Plus />{t("customers.new")}</Link></Button> : null}
      />
      <Card>
        <ListToolbar t={t} sp={sp} filters={[statusFilter(t)]} />
        {data.items.length === 0 ? (
          <EmptyState title={t("common.noResults")} hint={t("common.noResultsHint")} />
        ) : (
          <Table>
            <thead>
              <tr className="border-b">
                <Th>{t("common.code")}</Th>
                <Th>{t("common.name")}</Th>
                <Th>{t("fields.phone")}</Th>
                <Th>{t("fields.whatsapp")}</Th>
                <Th>{t("fields.city")}</Th>
                <Th>{t("fields.showroom")}</Th>
                <Th>{t("common.status")}</Th>
                <Th>{t("common.createdAt")}</Th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((c) => (
                <Tr key={c.id}>
                  <Td><Num className="text-muted-foreground">{c.code}</Num></Td>
                  <Td><Link href={`/customers/${c.id}`} className="font-medium hover:underline">{c.name}</Link></Td>
                  <Td><Num>{c.phone ?? "—"}</Num></Td>
                  <Td><Num>{c.whatsapp ?? "—"}</Num></Td>
                  <Td>{[c.city, c.governorate].filter(Boolean).join("، ") || "—"}</Td>
                  <Td>{c.showroom?.name ?? "—"}</Td>
                  <Td><StatusBadge t={t} group="RecordStatus" value={c.status} /></Td>
                  <Td className="text-muted-foreground"><Num>{formatDate(locale, c.createdAt)}</Num></Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
        <Pagination t={t} page={data.page} pageCount={data.pageCount} total={data.total} searchParams={sp} basePath="/customers" />
      </Card>
    </>
  );
}
