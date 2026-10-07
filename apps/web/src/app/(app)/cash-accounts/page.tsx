import { can, cashAccounts, lookups } from "@edge/core";
import { formatNumber } from "@edge/i18n";
import { Forbidden } from "@/components/forbidden";
import { SimpleCrud } from "@/components/simple-crud";
import { StatusBadge } from "@/components/status-badge";
import { Num } from "@/components/ui/primitives";
import { getT } from "@/server/i18n";
import { requirePageContext } from "@/server/session";

export default async function CashAccountsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requirePageContext();
  const { t, locale } = await getT();
  if (!can(ctx.actor, "cash_accounts.view")) return <Forbidden t={t} />;
  const sp = await searchParams;
  const [rows, showrooms] = await Promise.all([cashAccounts.listCashAccounts(ctx), can(ctx.actor, "cash_accounts.manage") ? lookups.showroomOptions(ctx) : Promise.resolve([])]);
  return (
    <SimpleCrud
      t={t}
      sp={sp}
      title={t("cashAccounts.title")}
      newLabel={t("cashAccounts.new")}
      basePath="/cash-accounts"
      endpoint="/cash-accounts"
      rows={rows}
      canCreate={can(ctx.actor, "cash_accounts.manage")}
      canEdit={can(ctx.actor, "cash_accounts.manage")}
      defaults={{ status: "ACTIVE", type: "CASH" }}
      fields={[
        { name: "code", label: "common.code", required: true, dir: "ltr", disabledOnEdit: true },
        { name: "name", label: "common.name", required: true },
        { name: "type", label: "cashAccounts.type", type: "select", required: true, options: ["CASH", "BANK"].map((v) => ({ value: v, label: `status.CashAccountType.${v}` })) },
        { name: "showroomId", label: "fields.showroom", type: "select", emptyOption: "fields.none", options: showrooms.map((s) => ({ value: s.id, label: s.name, raw: true })) },
        { name: "bankName", label: "cashAccounts.bankName" },
        { name: "accountNo", label: "cashAccounts.accountNo", dir: "ltr" },
        { name: "status", label: "common.status", type: "select", required: true, options: [{ value: "ACTIVE", label: "status.RecordStatus.ACTIVE" }, { value: "INACTIVE", label: "status.RecordStatus.INACTIVE" }] },
      ]}
      columns={[
        { header: t("common.code"), cell: (r) => <Num className="text-muted-foreground">{r.code}</Num> },
        { header: t("common.name"), cell: (r) => <span className="font-medium">{r.name}</span> },
        { header: t("cashAccounts.type"), cell: (r) => t(`status.CashAccountType.${r.type}`) },
        { header: t("fields.showroom"), cell: (r) => r.showroom?.name ?? "—" },
        { header: t("cashAccounts.balance"), className: "text-end", cell: (r) => <Num className="font-semibold">{r.balance === null ? "—" : formatNumber(locale, r.balance)}</Num> },
        { header: t("common.status"), cell: (r) => <StatusBadge t={t} group="RecordStatus" value={r.status} /> },
      ]}
    />
  );
}
