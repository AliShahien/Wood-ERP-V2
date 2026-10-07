import Link from "next/link";
import { Plus, Search } from "@/components/ui/material-icons";
import { can, users } from "@edge/core";
import { formatDate } from "@edge/i18n";
import { Forbidden } from "@/components/forbidden";
import { Pagination } from "@/components/pagination";
import { Button } from "@/components/ui/button";
import { Badge, Card, EmptyState, Input, NativeSelect, Num, PageHeader, Table, Td, Th, Tr } from "@/components/ui/primitives";
import { getT } from "@/server/i18n";
import { requirePageContext } from "@/server/session";

type SP = Promise<Record<string, string | undefined>>;

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t("users.title") };
}

export default async function UsersPage({ searchParams }: { searchParams: SP }) {
  const ctx = await requirePageContext();
  const { t, locale } = await getT();
  if (!can(ctx.actor, "users.view")) return <Forbidden t={t} />;
  const sp = await searchParams;
  const data = await users.listUsers(ctx, { page: sp.page, q: sp.q, status: sp.status || undefined, sort: "createdAt", order: "desc" });

  return (
    <>
      <PageHeader
        title={t("users.title")}
        actions={can(ctx.actor, "users.create") ? (
          <Button asChild><Link href="/users/new"><Plus />{t("users.new")}</Link></Button>
        ) : null}
      />
      <Card>
        <form className="flex flex-wrap gap-2 border-b p-3" role="search">
          <div className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute start-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input name="q" defaultValue={sp.q} placeholder={t("common.searchPlaceholder")} className="ps-8" />
          </div>
          <NativeSelect name="status" defaultValue={sp.status ?? ""} className="w-40">
            <option value="">{t("common.all")}</option>
            <option value="ACTIVE">{t("status.RecordStatus.ACTIVE")}</option>
            <option value="INACTIVE">{t("status.RecordStatus.INACTIVE")}</option>
          </NativeSelect>
          <Button type="submit" variant="secondary">{t("common.filter")}</Button>
        </form>
        {data.items.length === 0 ? (
          <EmptyState title={t("common.noResults")} hint={t("common.noResultsHint")} />
        ) : (
          <Table>
            <thead>
              <tr className="border-b">
                <Th>{t("common.code")}</Th>
                <Th>{t("users.fullName")}</Th>
                <Th>{t("users.username")}</Th>
                <Th>{t("users.roles")}</Th>
                <Th>{t("users.showroom")}</Th>
                <Th>{t("common.status")}</Th>
                <Th>{t("users.lastLogin")}</Th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((u) => (
                <Tr key={u.id}>
                  <Td><Num className="text-muted-foreground">{u.code}</Num></Td>
                  <Td>
                    <Link href={`/users/${u.id}`} className="font-medium hover:underline">{u.fullName}</Link>
                  </Td>
                  <Td><Num>{u.username}</Num></Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      {u.roles.map(({ role }) => <Badge key={role.id}>{locale === "ar" ? role.nameAr : role.nameEn}</Badge>)}
                    </div>
                  </Td>
                  <Td>{u.showroom?.name ?? t("common.none")}</Td>
                  <Td><Badge tone={u.status === "ACTIVE" ? "success" : "neutral"}>{t(`status.RecordStatus.${u.status}`)}</Badge></Td>
                  <Td className="whitespace-nowrap text-muted-foreground"><Num>{u.lastLoginAt ? formatDate(locale, u.lastLoginAt, true) : "—"}</Num></Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
        <Pagination t={t} page={data.page} pageCount={data.pageCount} total={data.total} searchParams={sp} basePath="/users" />
      </Card>
    </>
  );
}
