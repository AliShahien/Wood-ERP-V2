import Link from "next/link";
import { can, dashboard } from "@edge/core";
import { formatDate, formatNumber, type Translator } from "@edge/i18n";
import { StatusBadge } from "@/components/status-badge";
import { Badge, Card, CardContent, CardHeader, CardTitle, Num, PageHeader } from "@/components/ui/primitives";
import { getT } from "@/server/i18n";
import { requirePageContext } from "@/server/session";
import { Button } from "@/components/ui/button";
import { WorkflowPath } from "@/components/workflow-path";

type D = Awaited<ReturnType<typeof dashboard.getDashboard>>;
type Sales = { today: number; month: number; pendingQuotations: number; byShowroom: { name: string; value: number }[]; byMonth: { period: string; value: number }[]; byProduct: { name: string; value: number }[] };
type Finance = { receivables: number; payables: number; cash: number; bank: number; expensesMonth: number; purchasesMonth: number };
type Inventory = { lowStock: number; value: number | null; recent: { id: string; type: string; quantity: unknown; referenceNumber: string; transactionDate: Date; material: { name: string } }[] };
type Production = { active: number; byStatus: { status: string; count: number }[]; completedMonth: number; delayed: number; estimatedCost: number | null; actualCost: number | null };

function Kpi({ label, value, href, tone }: { label: string; value: string; href?: string; tone?: "danger" | "warning" }) {
  const body = (
    <Card className="h-full transition-colors hover:border-primary/60">
      <CardContent className="pt-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`num mt-1 text-xl font-semibold ${tone === "danger" ? "text-destructive" : tone === "warning" ? "text-[oklch(0.55_0.13_70)]" : ""}`}>{value}</p>
      </CardContent>
    </Card>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

/** Horizontal bar list — a readable, RTL-safe chart for small category sets. */
function Bars({ t, rows, fmt }: { t: Translator; rows: { label: string; value: number }[]; fmt: (v: number) => string }) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  if (!rows.length || rows.every((r) => r.value === 0)) return <p className="text-sm text-muted-foreground">{t("dashboard.noData")}</p>;
  return (
    <ul className="grid gap-2">
      {rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 text-sm">
          <span className="truncate" title={r.label}>{r.label}</span>
          <span className="h-2.5 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full bg-primary" style={{ width: `${(r.value / max) * 100}%` }} /></span>
          <Num className="text-muted-foreground">{fmt(r.value)}</Num>
        </li>
      ))}
    </ul>
  );
}

export default async function DashboardPage() {
  const ctx = await requirePageContext();
  const { t, locale } = await getT();
  const d: D = await dashboard.getDashboard(ctx);
  const f = (v: number | null | undefined) => (v === null || v === undefined ? "—" : formatNumber(locale, v));
  const i = (v: number) => formatNumber(locale, v, 0);
  const sales = d.sales as Sales | undefined;
  const finance = d.finance as Finance | undefined;
  const inventory = d.inventory as Inventory | undefined;
  const production = d.production as Production | undefined;
  const empty = !sales && !finance && !inventory && !production;

  return (
    <>
      <PageHeader title={t("dashboard.welcome", { name: ctx.actor.fullName })} description={empty ? t("dashboard.intro") : undefined} actions={can(ctx.actor, "quotations.create") ? <Button asChild><Link href="/quotations/new">{t("quotations.new")}</Link></Button> : undefined} />
      <WorkflowPath t={t} steps={[
        { labelKey: "nav.gallery", href: can(ctx.actor, "products.view") ? "/gallery" : undefined },
        { labelKey: "nav.customers", href: can(ctx.actor, "customers.view") ? "/customers" : undefined },
        { labelKey: "nav.measurements", href: can(ctx.actor, "measurements.view") ? "/measurements" : undefined },
        { labelKey: "nav.quotations", href: can(ctx.actor, "quotations.view") ? "/quotations" : undefined },
        { labelKey: "nav.salesOrders", href: can(ctx.actor, "sales_orders.view") ? "/sales-orders" : undefined },
        { labelKey: "nav.manufacturing", href: can(ctx.actor, "manufacturing.view") ? "/manufacturing" : undefined },
        { labelKey: "deliveries.title", href: can(ctx.actor, "deliveries.view") ? "/deliveries" : undefined },
        { labelKey: "nav.invoices", href: can(ctx.actor, "invoices.view") ? "/invoices" : undefined },
      ]} />
      <div className="grid gap-6">
        {sales ? (
          <section className="grid gap-4">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              <Kpi label={t("dashboard.todaySales")} value={f(sales.today)} href="/invoices" />
              <Kpi label={t("dashboard.monthSales")} value={f(sales.month)} href="/reports/sales" />
              <Kpi label={t("dashboard.pendingQuotations")} value={i(sales.pendingQuotations)} href="/quotations?status=SUBMITTED" tone={sales.pendingQuotations ? "warning" : undefined} />
            </div>
            <div className="grid gap-4 lg:grid-cols-3">
              <Card><CardHeader><CardTitle>{t("dashboard.salesByPeriod")}</CardTitle></CardHeader><CardContent><Bars t={t} rows={sales.byMonth.map((m) => ({ label: m.period, value: m.value }))} fmt={f} /></CardContent></Card>
              <Card><CardHeader><CardTitle>{t("dashboard.salesByShowroom")}</CardTitle></CardHeader><CardContent><Bars t={t} rows={sales.byShowroom.map((m) => ({ label: m.name, value: m.value }))} fmt={f} /></CardContent></Card>
              <Card><CardHeader><CardTitle>{t("dashboard.salesByProduct")}</CardTitle></CardHeader><CardContent><Bars t={t} rows={sales.byProduct.map((m) => ({ label: m.name, value: m.value }))} fmt={f} /></CardContent></Card>
            </div>
          </section>
        ) : null}

        {finance ? (
          <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Kpi label={t("dashboard.receivables")} value={f(finance.receivables)} href="/reports/customer_balances" />
            <Kpi label={t("dashboard.payables")} value={f(finance.payables)} href="/reports/supplier_balances" />
            <Kpi label={t("dashboard.cash")} value={f(finance.cash)} href="/cash-accounts" tone={finance.cash < 0 ? "danger" : undefined} />
            <Kpi label={t("dashboard.bank")} value={f(finance.bank)} href="/cash-accounts" tone={finance.bank < 0 ? "danger" : undefined} />
            <Kpi label={t("dashboard.expensesMonth")} value={f(finance.expensesMonth)} href="/expenses" />
            <Kpi label={t("dashboard.purchasesMonth")} value={f(finance.purchasesMonth)} href="/reports/purchases" />
          </section>
        ) : null}

        {production ? (
          <section className="grid gap-4 lg:grid-cols-[2fr_1fr]">
            <div className="grid grid-cols-2 content-start gap-3 md:grid-cols-3">
              <Kpi label={t("dashboard.activeManufacturing")} value={i(production.active)} href="/manufacturing" />
              <Kpi label={t("dashboard.completedMonth")} value={i(production.completedMonth)} href="/manufacturing?status=COMPLETED" />
              <Kpi label={t("dashboard.delayed")} value={i(production.delayed)} href="/manufacturing?delayed=1" tone={production.delayed ? "danger" : undefined} />
              {production.estimatedCost !== null ? <Kpi label={t("dashboard.estimatedCost")} value={f(production.estimatedCost)} href="/reports/estimated_vs_actual" /> : null}
              {production.actualCost !== null ? <Kpi label={t("dashboard.actualCost")} value={f(production.actualCost)} href="/reports/estimated_vs_actual" tone={(production.actualCost ?? 0) > (production.estimatedCost ?? 0) ? "warning" : undefined} /> : null}
            </div>
            <Card>
              <CardHeader><CardTitle>{t("dashboard.productionStatus")}</CardTitle></CardHeader>
              <CardContent className="grid gap-2 text-sm">
                {production.byStatus.length === 0 ? <p className="text-muted-foreground">{t("dashboard.noData")}</p> : production.byStatus.map((s) => (
                  <Link key={s.status} href={`/manufacturing?status=${s.status}`} className="flex items-center justify-between hover:underline"><StatusBadge t={t} group="ManufacturingStatus" value={s.status} /><Num className="font-semibold">{s.count}</Num></Link>
                ))}
              </CardContent>
            </Card>
          </section>
        ) : null}

        {inventory ? (
          <section className="grid gap-4 lg:grid-cols-[1fr_2fr]">
            <div className="grid grid-cols-2 content-start gap-3">
              <Kpi label={t("dashboard.lowStock")} value={i(inventory.lowStock)} href="/materials?lowStock=1" tone={inventory.lowStock ? "danger" : undefined} />
              {inventory.value !== null ? <Kpi label={t("dashboard.inventoryValue")} value={f(inventory.value)} href="/stock" /> : null}
            </div>
            <Card>
              <CardHeader><CardTitle>{t("dashboard.recentMovements")}</CardTitle></CardHeader>
              <CardContent className="grid gap-1.5 text-sm">
                {inventory.recent.length === 0 ? <p className="text-muted-foreground">{t("dashboard.noData")}</p> : inventory.recent.map((m) => (
                  <div key={m.id} className="flex items-center gap-3">
                    <Num className="w-28 shrink-0 text-xs text-muted-foreground">{formatDate(locale, m.transactionDate)}</Num>
                    <span className="min-w-0 flex-1 truncate">{m.material.name}</span>
                    <Badge>{t(`status.InventoryTxType.${m.type}`)}</Badge>
                    <Num className={Number(m.quantity) < 0 ? "text-destructive" : "text-success"}>{Number(m.quantity) > 0 ? "+" : ""}{formatNumber(locale, Number(m.quantity), 2)}</Num>
                  </div>
                ))}
              </CardContent>
            </Card>
          </section>
        ) : null}
      </div>
    </>
  );
}
