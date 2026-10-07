import Link from "next/link";
import { Plus } from "@/components/ui/material-icons";
import { can, purchasing } from "@edge/core";
import { formatDate } from "@edge/i18n";
import { Forbidden } from "@/components/forbidden";
import { Pagination } from "@/components/pagination";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, Num, PageHeader, Table, Td, Th, Tr } from "@/components/ui/primitives";
import { getT } from "@/server/i18n";
import { requirePageContext } from "@/server/session";
import { PurchaseRequestForm } from "./pr-form";

export default async function PurchaseRequestsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requirePageContext();
  const { t, locale } = await getT();
  if (!can(ctx.actor, "purchases.view")) return <Forbidden t={t} />;
  const sp = await searchParams;
  const creating = sp.new === "1" && can(ctx.actor, "purchases.create");
  const data = await purchasing.listPurchaseRequests(ctx, { page: sp.page, q: sp.q });
  return (
    <>
      <PageHeader title={t("purchasing.requests")} actions={can(ctx.actor, "purchases.create") && !creating ? <Button asChild><Link href="/purchase-requests?new=1"><Plus />{t("purchasing.newRequest")}</Link></Button> : null} />
      {creating ? <div className="mb-4"><PurchaseRequestForm /></div> : null}
      <Card>
        {data.items.length === 0 ? <EmptyState title={t("common.noResults")} /> : (
          <Table>
            <thead><tr className="border-b"><Th>{t("common.code")}</Th><Th>{t("purchasing.reason")}</Th><Th>{t("materialIssues.lines")}</Th><Th>{t("purchasing.requiredDate")}</Th><Th>{t("common.createdAt")}</Th><Th>{t("common.status")}</Th></tr></thead>
            <tbody>
              {data.items.map((r) => (
                <Tr key={r.id}>
                  <Td><Link href={`/purchase-requests/${r.id}`} className="num font-medium hover:underline">{r.number}</Link></Td>
                  <Td>{r.reason ?? "—"}</Td><Td><Num>{r._count.items}</Num></Td>
                  <Td><Num>{r.requiredDate ? formatDate(locale, r.requiredDate) : "—"}</Num></Td>
                  <Td><Num>{formatDate(locale, r.requestDate)}</Num></Td>
                  <Td><StatusBadge t={t} group="PurchaseRequestStatus" value={r.status} /></Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
        <Pagination t={t} page={data.page} pageCount={data.pageCount} total={data.total} searchParams={sp} basePath="/purchase-requests" />
      </Card>
    </>
  );
}
