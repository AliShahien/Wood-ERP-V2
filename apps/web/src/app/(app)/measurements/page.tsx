import Link from "next/link";
import { Plus } from "@/components/ui/material-icons";
import { can, measurements } from "@edge/core";
import { formatDate } from "@edge/i18n";
import { Forbidden } from "@/components/forbidden";
import { ListToolbar } from "@/components/list-toolbar";
import { Pagination } from "@/components/pagination";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, Num, PageHeader, Table, Td, Th, Tr } from "@/components/ui/primitives";
import { getT } from "@/server/i18n";
import { requirePageContext } from "@/server/session";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t("measurements.title") };
}

export default async function MeasurementsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requirePageContext();
  const { t, locale } = await getT();
  if (!can(ctx.actor, "measurements.view")) return <Forbidden t={t} />;
  const sp = await searchParams;
  const data = await measurements.listMeasurements(ctx, { page: sp.page, q: sp.q, status: sp.status || undefined, customerId: sp.customerId || undefined });
  return (
    <>
      <PageHeader title={t("measurements.title")} actions={can(ctx.actor, "measurements.create") ? <Button asChild><Link href="/measurements/new"><Plus />{t("measurements.new")}</Link></Button> : null} />
      <Card>
        <ListToolbar t={t} sp={sp} filters={[{ name: "status", options: ["DRAFT", "APPROVED", "CANCELLED"].map((s) => ({ value: s, label: t(`status.MeasurementStatus.${s}`) })) }]} />
        {data.items.length === 0 ? <EmptyState title={t("common.noResults")} /> : (
          <Table>
            <thead><tr className="border-b">
              <Th>{t("common.code")}</Th><Th>{t("measurements.customer")}</Th><Th>{t("measurements.product")}</Th><Th>{t("measurements.room")}</Th>
              <Th>{t("docs.size")}</Th><Th>{t("measurements.version")}</Th><Th>{t("measurements.date")}</Th><Th>{t("common.status")}</Th>
            </tr></thead>
            <tbody>
              {data.items.map((m) => {
                const v = m.versions[0];
                return (
                  <Tr key={m.id}>
                    <Td><Link href={`/measurements/${m.id}`} className="num font-medium hover:underline">{m.number}</Link></Td>
                    <Td>{m.customer.name}</Td>
                    <Td dir="ltr" className="text-start">{m.product?.name ?? "—"}</Td>
                    <Td>{[m.location, m.room].filter(Boolean).join(" · ") || "—"}</Td>
                    <Td><Num>{v ? `${Number(v.width)} × ${Number(v.height)}${v.thickness ? ` × ${Number(v.thickness)}` : ""}` : "—"}</Num></Td>
                    <Td><Num>v{m.currentVersion}</Num></Td>
                    <Td><Num>{formatDate(locale, m.measurementDate)}</Num></Td>
                    <Td><StatusBadge t={t} group="MeasurementStatus" value={m.status} /></Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}
        <Pagination t={t} page={data.page} pageCount={data.pageCount} total={data.total} searchParams={sp} basePath="/measurements" />
      </Card>
    </>
  );
}
