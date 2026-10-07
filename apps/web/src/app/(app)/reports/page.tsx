import Link from "next/link";
import { BarChart3 } from "@/components/ui/material-icons";
import { can, reports } from "@edge/core";
import { Forbidden } from "@/components/forbidden";
import { Card, CardContent, EmptyState, PageHeader } from "@/components/ui/primitives";
import { getT } from "@/server/i18n";
import { requirePageContext } from "@/server/session";

export default async function ReportsPage() {
  const ctx = await requirePageContext();
  const { t } = await getT();
  if (!can(ctx.actor, "reports.view")) return <Forbidden t={t} />;
  const list = reports.availableReports(ctx);
  return (
    <>
      <PageHeader title={t("reports.title")} />
      {list.length === 0 ? <Card><EmptyState title={t("common.noResults")} /></Card> : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {list.map((r) => (
            <Link key={r.id} href={`/reports/${r.id}`}>
              <Card className="h-full transition-colors hover:border-primary">
                <CardContent className="flex items-center gap-3 pt-5">
                  <span className="grid size-9 place-items-center rounded-md bg-primary/10 text-primary"><BarChart3 className="size-4" /></span>
                  <span className="font-medium">{t(r.titleKey)}</span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
