import { Search } from "@/components/ui/material-icons";
import type { ReactNode } from "react";
import type { Translator } from "@edge/i18n";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/primitives";

export type FilterDef = { name: string; options: { value: string; label: string }[]; allLabel?: string };

/** GET search/filter form for server-rendered list pages. */
export function ListToolbar({ t, sp, filters = [], children }: { t: Translator; sp: Record<string, string | undefined>; filters?: FilterDef[]; children?: ReactNode }) {
  return (
    <form className="flex flex-wrap gap-2 border-b p-3" role="search">
      <div className="relative min-w-56 flex-1">
        <Search className="pointer-events-none absolute start-2.5 top-2.5 size-4 text-muted-foreground" />
        <Input name="q" defaultValue={sp.q} placeholder={t("common.searchPlaceholder")} className="ps-8" />
      </div>
      {filters.map((f) => (
        <NativeSelect key={f.name} name={f.name} defaultValue={sp[f.name] ?? ""} className="w-44">
          <option value="">{f.allLabel ?? t("common.all")}</option>
          {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </NativeSelect>
      ))}
      {children}
      <Button type="submit" variant="secondary">{t("common.filter")}</Button>
    </form>
  );
}

export function statusFilter(t: Translator): FilterDef {
  return { name: "status", options: [{ value: "ACTIVE", label: t("status.RecordStatus.ACTIVE") }, { value: "INACTIVE", label: t("status.RecordStatus.INACTIVE") }] };
}
