import Link from "next/link";
import { can, manufacturing } from "@edge/core";
import { formatDate } from "@edge/i18n";
import { Forbidden } from "@/components/forbidden";
import { ListToolbar } from "@/components/list-toolbar";
import { Pagination } from "@/components/pagination";
import { StatusBadge } from "@/components/status-badge";
import { Badge, Card, Checkbox, EmptyState, Num, PageHeader, Table, Td, Th, Tr } from "@/components/ui/primitives";
import { getT } from "@/server/i18n";
import { requirePageContext } from "@/server/session";

const STATUSES = ["DRAFT", "APPROVED", "WAITING_MATERIALS", "MATERIALS_ISSUED", "IN_PRODUCTION", "QUALITY_CHECK", "COMPLETED", "CANCELLED"];

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t("manufacturing.title") };
}

export default async function ManufacturingPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requirePageContext();
  const { t, locale } = await getT();
  if (!can(ctx.actor, "manufacturing.view")) return <Forbidden t={t} />;
  const sp = await searchParams;
  const data = await manufacturing.listManufacturingOrders(ctx, { page: sp.page, q: sp.q, status: sp.status || undefined, delayed: sp.delayed === "1" ? "1" : undefined });
  const now = new Date();
  return (
    <>
      <PageHeader title={t("manufacturing.title")} />
      <Card>
        <ListToolbar t={t} sp={sp} filters={[{ name: "status", options: STATUSES.map((s) => ({ value: s, label: t(`status.ManufacturingStatus.${s}`) })) }]}>
          <label className="flex items-center gap-2 px-2 text-sm"><Checkbox name="delayed" value="1" defaultChecked={sp.delayed === "1"} />{t("manufacturing.delayed")}</label>
        </ListToolbar>
        {data.items.length === 0 ? <EmptyState title={t("common.noResults")} /> : (
          <Table>
            <thead><tr className="border-b">
              <Th>{t("common.code")}</Th><Th>{t("quotations.customer")}</Th><Th>{t("manufacturing.product")}</Th><Th>{t("manufacturing.size")}</Th>
              <Th className="text-end">{t("manufacturing.quantity")}</Th><Th>{t("manufacturing.priority")}</Th><Th>{t("manufacturing.requiredDate")}</Th><Th>{t("common.status")}</Th>
            </tr></thead>
            <tbody>
              {data.items.map((m) => {
                const late = m.requiredDate && m.requiredDate < now && !["COMPLETED", "CANCELLED"].includes(m.status);
                return (
                  <Tr key={m.id}>
                    <Td><Link href={`/manufacturing/${m.id}`} className="num font-medium hover:underline">{m.number}</Link><div className="num text-xs text-muted-foreground">{m.salesOrder.number}</div></Td>
                    <Td>{m.customer.name}</Td>
                    <Td dir="ltr" className="text-start">{m.product.name}</Td>
                    <Td><Num>{Number(m.width)} × {Number(m.height)}{m.thickness ? ` × ${Number(m.thickness)}` : ""}</Num></Td>
                    <Td className="text-end"><Num>{Number(m.quantity)}</Num></Td>
                    <Td><StatusBadge t={t} group="Priority" value={m.priority} /></Td>
                    <Td><Num className={late ? "font-semibold text-destructive" : ""}>{m.requiredDate ? formatDate(locale, m.requiredDate) : "—"}</Num>{late ? <Badge tone="danger" className="ms-1">{t("manufacturing.delayed")}</Badge> : null}</Td>
                    <Td><StatusBadge t={t} group="ManufacturingStatus" value={m.status} /></Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}
        <Pagination t={t} page={data.page} pageCount={data.pageCount} total={data.total} searchParams={sp} basePath="/manufacturing" />
      </Card>
    </>
  );
}
