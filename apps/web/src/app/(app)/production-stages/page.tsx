import { can, productionStages } from "@edge/core";
import { formatNumber } from "@edge/i18n";
import { Forbidden } from "@/components/forbidden";
import { SimpleCrud } from "@/components/simple-crud";
import { StatusBadge } from "@/components/status-badge";
import { Num } from "@/components/ui/primitives";
import { getT } from "@/server/i18n";
import { requirePageContext } from "@/server/session";

export default async function ProductionStagesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requirePageContext();
  const { t, locale } = await getT();
  if (!can(ctx.actor, "settings.view")) return <Forbidden t={t} />;
  const sp = await searchParams;
  const rows = await productionStages.listStages(ctx);
  return (
    <SimpleCrud
      t={t}
      sp={sp}
      title={t("production.stages")}
      newLabel={t("production.newStage")}
      basePath="/production-stages"
      endpoint="/production-stages"
      rows={rows}
      canCreate={can(ctx.actor, "settings.edit")}
      canEdit={can(ctx.actor, "settings.edit")}
      defaults={{ status: "ACTIVE", sequence: (rows.at(-1)?.sequence ?? 0) + 10, laborRatePerHour: 0 }}
      fields={[
        { name: "code", label: "common.code", required: true, dir: "ltr", disabledOnEdit: true },
        { name: "nameAr", label: "production.nameAr", required: true, dir: "rtl" },
        { name: "nameEn", label: "production.nameEn", required: true, dir: "ltr" },
        { name: "sequence", label: "production.sequence", type: "number", required: true },
        { name: "laborRatePerHour", label: "production.laborRate", type: "number", min: 0, step: "0.01" },
        { name: "isQcStage", label: "production.isQc", type: "checkbox" },
        { name: "status", label: "common.status", type: "select", required: true, options: [{ value: "ACTIVE", label: "status.RecordStatus.ACTIVE" }, { value: "INACTIVE", label: "status.RecordStatus.INACTIVE" }] },
      ]}
      columns={[
        { header: t("production.sequence"), cell: (r) => <Num>{r.sequence}</Num> },
        { header: t("common.code"), cell: (r) => <Num className="text-muted-foreground">{r.code}</Num> },
        { header: t("common.name"), cell: (r) => <span className="font-medium">{locale === "ar" ? r.nameAr : r.nameEn}</span> },
        { header: t("production.laborRate"), className: "text-end", cell: (r) => <Num>{formatNumber(locale, Number(r.laborRatePerHour))}</Num> },
        { header: t("production.isQc"), cell: (r) => (r.isQcStage ? t("common.yes") : t("common.no")) },
        { header: t("common.status"), cell: (r) => <StatusBadge t={t} group="RecordStatus" value={r.status} /> },
      ]}
    />
  );
}
