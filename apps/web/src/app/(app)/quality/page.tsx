import Link from "next/link";
import { can, manufacturing } from "@edge/core";
import { formatDate } from "@edge/i18n";
import { Forbidden } from "@/components/forbidden";
import { Pagination } from "@/components/pagination";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardHeader, CardTitle, EmptyState, Num, PageHeader, Table, Td, Th, Tr } from "@/components/ui/primitives";
import { getT } from "@/server/i18n";
import { requirePageContext } from "@/server/session";

export default async function QualityPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requirePageContext();
  const { t, locale } = await getT();
  if (!can(ctx.actor, "quality.view")) return <Forbidden t={t} />;
  const sp = await searchParams;
  const [pending, recent] = await Promise.all([
    can(ctx.actor, "manufacturing.view") ? manufacturing.listManufacturingOrders(ctx, { status: "QUALITY_CHECK", pageSize: 100 }) : Promise.resolve(null),
    manufacturing.listQualityChecks(ctx, { page: sp.page, pageSize: 20 }),
  ]);
  return (
    <>
      <PageHeader title={t("quality.title")} />
      <div className="grid gap-4">
        {pending ? (
          <Card>
            <CardHeader><CardTitle>{t("quality.pending")}</CardTitle></CardHeader>
            {pending.items.length === 0 ? <EmptyState title={t("common.noResults")} /> : (
              <Table>
                <thead><tr className="border-b"><Th>{t("common.code")}</Th><Th>{t("quotations.customer")}</Th><Th>{t("manufacturing.product")}</Th><Th>{t("manufacturing.size")}</Th><Th>{t("manufacturing.requiredDate")}</Th></tr></thead>
                <tbody>
                  {pending.items.map((m) => (
                    <Tr key={m.id}>
                      <Td><Link href={`/manufacturing/${m.id}`} className="num font-medium hover:underline">{m.number}</Link></Td>
                      <Td>{m.customer.name}</Td><Td dir="ltr" className="text-start">{m.product.name}</Td>
                      <Td><Num>{Number(m.width)} × {Number(m.height)}</Num></Td>
                      <Td><Num>{m.requiredDate ? formatDate(locale, m.requiredDate) : "—"}</Num></Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        ) : null}
        <Card>
          <CardHeader><CardTitle>{t("manufacturing.qualityChecks")}</CardTitle></CardHeader>
          <Table>
            <thead><tr className="border-b"><Th>{t("common.code")}</Th><Th>{t("docs.manufacturingOrderRef")}</Th><Th>{t("quality.result")}</Th><Th>{t("quality.inspector")}</Th><Th>{t("quality.date")}</Th><Th>{t("quality.defects")}</Th></tr></thead>
            <tbody>
              {recent.items.map((q) => (
                <Tr key={q.id}>
                  <Td><Num className="font-medium">{q.number}</Num></Td>
                  <Td><Link href={`/manufacturing/${q.manufacturingOrder.id}`} className="num hover:underline">{q.manufacturingOrder.number}</Link></Td>
                  <Td><StatusBadge t={t} group="QcResult" value={q.result} /></Td>
                  <Td>{q.inspector.fullName}</Td>
                  <Td><Num>{formatDate(locale, q.checkDate, true)}</Num></Td>
                  <Td className="text-muted-foreground">{q.defects ?? "—"}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
          <Pagination t={t} page={recent.page} pageCount={recent.pageCount} total={recent.total} searchParams={sp} basePath="/quality" />
        </Card>
      </div>
    </>
  );
}
