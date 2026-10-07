import { can, materials } from "@edge/core";
import { Forbidden } from "@/components/forbidden";
import { SimpleCrud } from "@/components/simple-crud";
import { StatusBadge } from "@/components/status-badge";
import { Num } from "@/components/ui/primitives";
import { getT } from "@/server/i18n";
import { requirePageContext } from "@/server/session";

export default async function UnitsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requirePageContext();
  const { t } = await getT();
  if (!can(ctx.actor, "materials.view")) return <Forbidden t={t} />;
  const sp = await searchParams;
  const rows = await materials.listUnits(ctx);
  return (
    <SimpleCrud
      t={t}
      sp={sp}
      title={t("materials.units")}
      newLabel={t("materials.newUnit")}
      basePath="/units"
      endpoint="/units"
      rows={rows}
      canCreate={can(ctx.actor, "materials.create")}
      canEdit={can(ctx.actor, "materials.edit")}
      defaults={{ status: "ACTIVE", allowDecimal: true }}
      fields={[
        { name: "code", label: "common.code", required: true, dir: "ltr", disabledOnEdit: true },
        { name: "name", label: "common.name", required: true, dir: "rtl" },
        { name: "symbol", label: "fields.symbol", dir: "ltr" },
        { name: "allowDecimal", label: "fields.allowDecimal", type: "checkbox" },
        { name: "status", label: "common.status", type: "select", required: true, options: [{ value: "ACTIVE", label: "status.RecordStatus.ACTIVE" }, { value: "INACTIVE", label: "status.RecordStatus.INACTIVE" }] },
      ]}
      columns={[
        { header: t("common.code"), cell: (r) => <Num className="text-muted-foreground">{r.code}</Num> },
        { header: t("common.name"), cell: (r) => <span className="font-medium">{r.name}</span> },
        { header: t("fields.symbol"), cell: (r) => <Num>{r.symbol ?? "—"}</Num> },
        { header: t("fields.allowDecimal"), cell: (r) => (r.allowDecimal ? t("common.yes") : t("common.no")) },
        { header: t("common.status"), cell: (r) => <StatusBadge t={t} group="RecordStatus" value={r.status} /> },
      ]}
    />
  );
}
