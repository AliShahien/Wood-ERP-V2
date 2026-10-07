import Link from "next/link";
import { ChevronLeft, ChevronRight } from "@/components/ui/material-icons";
import type { Translator } from "@edge/i18n";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Server-rendered pagination via query string (keeps filters). */
export function Pagination({ t, page, pageCount, total, searchParams, basePath }: {
  t: Translator;
  page: number;
  pageCount: number;
  total: number;
  searchParams: Record<string, string | undefined>;
  basePath: string;
}) {
  const href = (p: number) => {
    const sp = new URLSearchParams(Object.entries(searchParams).filter(([, v]) => v) as [string, string][]);
    sp.set("page", String(p));
    return `${basePath}?${sp}`;
  };
  return (
    <div className="flex items-center justify-between gap-3 border-t px-3 py-3 text-sm text-muted-foreground">
      <span>{t("common.totalRecords", { total })}</span>
      <div className="flex items-center gap-2">
        <span>{t("common.page", { page, pageCount })}</span>
        <Link aria-disabled={page <= 1} className={cn(buttonVariants({ variant: "outline", size: "icon" }), page <= 1 && "pointer-events-none opacity-40")} href={href(page - 1)} aria-label={t("common.previous")}>
          <ChevronLeft className="rtl:rotate-180" />
        </Link>
        <Link aria-disabled={page >= pageCount} className={cn(buttonVariants({ variant: "outline", size: "icon" }), page >= pageCount && "pointer-events-none opacity-40")} href={href(page + 1)} aria-label={t("common.next")}>
          <ChevronRight className="rtl:rotate-180" />
        </Link>
      </div>
    </div>
  );
}
