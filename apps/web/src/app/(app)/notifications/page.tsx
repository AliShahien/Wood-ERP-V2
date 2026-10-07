import Link from "next/link";
import { notifications } from "@edge/core";
import { formatDate } from "@edge/i18n";
import { ActionButton } from "@/components/action-button";
import { Pagination } from "@/components/pagination";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, Num, PageHeader } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import { getT } from "@/server/i18n";
import { requirePageContext } from "@/server/session";

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requirePageContext();
  const { t, locale } = await getT();
  const sp = await searchParams;
  const data = await notifications.listMyNotifications(ctx, { page: sp.page, unread: sp.unread === "1" ? "1" : undefined, pageSize: 30 });
  return (
    <>
      <PageHeader
        title={t("notifications.title")}
        actions={
          <>
            <Button asChild variant="outline"><Link href={sp.unread === "1" ? "/notifications" : "/notifications?unread=1"}>{sp.unread === "1" ? t("common.all") : t("notifications.unreadOnly")}</Link></Button>
            {data.unread ? <ActionButton endpoint="/notifications/read" body={{ all: true }} label="notifications.markAllRead" confirmKey={null} /> : null}
          </>
        }
      />
      <Card>
        {data.items.length === 0 ? <EmptyState title={t("notifications.empty")} /> : (
          <ul className="divide-y">
            {data.items.map((n) => {
              const text = t(`notifications.types.${n.type}`, (n.params ?? {}) as Record<string, string>);
              return (
                <li key={n.id} className={cn("flex items-start gap-3 px-4 py-3 text-sm", !n.readAt && "bg-primary/5")}>
                  <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.readAt ? "bg-transparent" : "bg-primary")} />
                  <div className="min-w-0 flex-1">
                    {n.href ? <Link href={n.href} className="hover:underline">{text}</Link> : <span>{text}</span>}
                    <p className="text-xs text-muted-foreground"><Num>{formatDate(locale, n.createdAt, true)}</Num></p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <Pagination t={t} page={data.page} pageCount={data.pageCount} total={data.total} searchParams={sp} basePath="/notifications" />
      </Card>
    </>
  );
}
