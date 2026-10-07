import Link from "next/link";
import { Plus } from "@/components/ui/material-icons";
import { can, cashAccounts, expenses, lookups } from "@edge/core";
import { formatDate, formatNumber } from "@edge/i18n";
import { ActionButton } from "@/components/action-button";
import { EntityForm } from "@/components/entity-form";
import { Forbidden } from "@/components/forbidden";
import { ListToolbar } from "@/components/list-toolbar";
import { Pagination } from "@/components/pagination";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, EmptyState, Num, PageHeader, Table, Td, Th, Tr } from "@/components/ui/primitives";
import { getT } from "@/server/i18n";
import { requirePageContext } from "@/server/session";

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requirePageContext();
  const { t, locale } = await getT();
  if (!can(ctx.actor, "expenses.view")) return <Forbidden t={t} />;
  const sp = await searchParams;
  const creating = sp.new === "1" && can(ctx.actor, "expenses.create");
  const [data, cats, accounts, showrooms] = await Promise.all([
    expenses.listExpenses(ctx, { page: sp.page, q: sp.q, categoryId: sp.categoryId || undefined, status: sp.status || undefined }),
    expenses.listCategories(ctx),
    creating ? cashAccounts.listCashAccounts(ctx) : Promise.resolve([]),
    creating ? lookups.showroomOptions(ctx) : Promise.resolve([]),
  ]);
  return (
    <>
      <PageHeader title={t("expenses.title")} actions={<>
        {can(ctx.actor, "expenses.create") && !creating ? <Button asChild><Link href="/expenses?new=1"><Plus />{t("expenses.new")}</Link></Button> : null}
        {can(ctx.actor, "expenses.create") ? <Button asChild variant="outline"><Link href="/expense-categories">{t("expenses.categories")}</Link></Button> : null}
      </>} />
      {creating ? (
        <div className="mb-4">
          <EntityForm
            endpoint="/expenses"
            method="POST"
            redirectTo="/expenses"
            initial={{ method: "CASH", expenseDate: new Date().toISOString().slice(0, 10), manufacturingOrderId: sp.moId ?? "" }}
            fields={[
              { name: "categoryId", label: "expenses.category", type: "select", required: true, options: cats.filter((c) => c.status === "ACTIVE").map((c) => ({ value: c.id, label: c.name, raw: true })) },
              { name: "amount", label: "expenses.amount", type: "number", required: true, min: 0.01, step: "0.01" },
              { name: "expenseDate", label: "expenses.date", type: "date" },
              { name: "method", label: "expenses.method", type: "select", required: true, options: ["CASH", "BANK_TRANSFER", "CARD", "OTHER"].map((m) => ({ value: m, label: `status.PaymentMethod.${m}` })) },
              { name: "cashAccountId", label: "expenses.account", type: "select", required: true, options: accounts.filter((a) => a.status === "ACTIVE").map((a) => ({ value: a.id, label: a.name, raw: true })) },
              { name: "showroomId", label: "expenses.showroom", type: "select", emptyOption: "fields.none", options: showrooms.map((s) => ({ value: s.id, label: s.name, raw: true })) },
              ...(sp.moId ? [{ name: "manufacturingOrderId", label: "expenses.mo", dir: "ltr" as const, disabledOnEdit: false }] : []),
              { name: "description", label: "expenses.description", required: true, span: 2 },
            ]}
          />
        </div>
      ) : null}
      <Card>
        <ListToolbar t={t} sp={sp} filters={[{ name: "categoryId", options: cats.map((c) => ({ value: c.id, label: c.name })) }, { name: "status", options: ["POSTED", "CANCELLED"].map((s) => ({ value: s, label: t(`status.ExpenseStatus.${s}`) })) }]} />
        {data.items.length === 0 ? <EmptyState title={t("common.noResults")} /> : (
          <Table>
            <thead><tr className="border-b"><Th>{t("common.code")}</Th><Th>{t("expenses.date")}</Th><Th>{t("expenses.category")}</Th><Th>{t("expenses.description")}</Th><Th>{t("expenses.account")}</Th><Th>{t("docs.manufacturingOrderRef")}</Th><Th className="text-end">{t("expenses.amount")}</Th><Th>{t("common.status")}</Th><Th /></tr></thead>
            <tbody>
              {data.items.map((e) => (
                <Tr key={e.id}>
                  <Td><Num className="font-medium">{e.number}</Num></Td>
                  <Td><Num>{formatDate(locale, e.expenseDate)}</Num></Td>
                  <Td>{e.category.name}</Td><Td>{e.description}</Td><Td>{e.cashAccount.name}</Td>
                  <Td>{e.manufacturingOrder ? <Link href={`/manufacturing/${e.manufacturingOrder.id}`} className="num hover:underline">{e.manufacturingOrder.number}</Link> : "—"}</Td>
                  <Td className="text-end"><Num>{formatNumber(locale, Number(e.amount))}</Num></Td>
                  <Td><StatusBadge t={t} group="ExpenseStatus" value={e.status} /></Td>
                  <Td>{e.status === "POSTED" && can(ctx.actor, "expenses.cancel") ? <ActionButton size="sm" endpoint={`/expenses/${e.id}/cancel`} label="expenses.cancel" variant="ghost" prompt="quotations.reasonPrompt" /> : null}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
        <CardContent className="flex justify-end pt-3 text-sm"><span className="text-muted-foreground">{t("expenses.total")}:&nbsp;</span><Num className="font-semibold">{formatNumber(locale, data.sum)}</Num></CardContent>
        <Pagination t={t} page={data.page} pageCount={data.pageCount} total={data.total} searchParams={sp} basePath="/expenses" />
      </Card>
    </>
  );
}
