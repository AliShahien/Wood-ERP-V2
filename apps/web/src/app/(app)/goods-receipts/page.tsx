import Link from "next/link";
import { Plus } from "@/components/ui/material-icons";
import { can, purchasing, warehouses } from "@edge/core";
import { formatDate } from "@edge/i18n";
import { Forbidden } from "@/components/forbidden";
import { ListToolbar } from "@/components/list-toolbar";
import { Pagination } from "@/components/pagination";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, Num, PageHeader, Table, Td, Th, Tr } from "@/components/ui/primitives";
import { getT } from "@/server/i18n";
import { requirePageContext } from "@/server/session";
import { DirectReceiptForm } from "./direct-receipt-form";

export default async function GoodsReceiptsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requirePageContext();
  const { t, locale } = await getT();
  if (!can(ctx.actor, "goods_receipts.view")) return <Forbidden t={t} />;
  const sp = await searchParams;
  const creating = sp.new === "1" && can(ctx.actor, "goods_receipts.create");
  const [data, whs] = await Promise.all([
    purchasing.listGoodsReceipts(ctx, { page: sp.page, q: sp.q, status: sp.status || undefined }),
    creating ? warehouses.listWarehouses(ctx, { pageSize: 100, status: "ACTIVE" }).then((r) => r.items) : Promise.resolve([]),
  ]);
  return (
    <>
      <PageHeader title={t("purchasing.receipts")} actions={can(ctx.actor, "goods_receipts.create") && !creating ? <Button asChild variant="outline"><Link href="/goods-receipts?new=1"><Plus />{t("purchasing.directReceipt")}</Link></Button> : null} />
      {creating ? <div className="mb-4"><DirectReceiptForm warehouses={whs.map((w) => ({ id: w.id, name: w.name }))} /></div> : null}
      <Card>
        <ListToolbar t={t} sp={sp} filters={[{ name: "status", options: ["DRAFT", "POSTED", "REVERSED"].map((s) => ({ value: s, label: t(`status.DocStatus.${s}`) })) }]} />
        {data.items.length === 0 ? <EmptyState title={t("common.noResults")} /> : (
          <Table>
            <thead><tr className="border-b"><Th>{t("common.code")}</Th><Th>{t("purchasing.supplier")}</Th><Th>{t("docs.purchaseOrderRef")}</Th><Th>{t("purchasing.warehouse")}</Th><Th>{t("materialIssues.lines")}</Th><Th>{t("common.createdAt")}</Th><Th>{t("common.status")}</Th></tr></thead>
            <tbody>
              {data.items.map((g) => (
                <Tr key={g.id}>
                  <Td><Link href={`/goods-receipts/${g.id}`} className="num font-medium hover:underline">{g.number}</Link></Td>
                  <Td>{g.supplier.name}</Td>
                  <Td>{g.purchaseOrder ? <Link href={`/purchase-orders/${g.purchaseOrder.id}`} className="num hover:underline">{g.purchaseOrder.number}</Link> : "—"}</Td>
                  <Td>{g.warehouse.name}</Td><Td><Num>{g._count.items}</Num></Td>
                  <Td><Num>{formatDate(locale, g.receiptDate)}</Num></Td>
                  <Td><StatusBadge t={t} group="DocStatus" value={g.status} /></Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
        <Pagination t={t} page={data.page} pageCount={data.pageCount} total={data.total} searchParams={sp} basePath="/goods-receipts" />
      </Card>
    </>
  );
}
