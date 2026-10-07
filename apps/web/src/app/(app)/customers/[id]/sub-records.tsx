"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Plus, Trash2 } from "@/components/ui/material-icons";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/primitives";
import { useI18n } from "@/components/i18n-provider";
import { api, ApiError } from "@/lib/api-client";

type Row = { id: string; primary: string; secondary: string };

/** Inline list + quick-add for customer addresses / contacts. */
export function SubRecords({ kind, customerId, rows, canEdit }: { kind: "addresses" | "contacts"; customerId: string; rows: Row[]; canEdit: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    const body = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v.trim() || null]));
    try {
      await api(`/customers/${customerId}/${kind}`, { body });
      setOpen(false);
      router.refresh();
    } catch (err) {
      toast.error(t(err instanceof ApiError ? err.body.messageKey : "errors.internal"));
    }
  }

  async function remove(id: string) {
    if (!confirm(t("common.areYouSure"))) return;
    await api(`/customers/${customerId}/${kind}/${id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="grid gap-3">
      {rows.length === 0 ? <p className="text-sm text-muted-foreground">{t("common.noResults")}</p> : null}
      <ul className="divide-y">
        {rows.map((r) => (
          <li key={r.id} className="flex items-start gap-2 py-2 text-sm">
            <div className="min-w-0 flex-1">
              <p className="font-medium">{r.primary}</p>
              {r.secondary ? <p className="text-xs text-muted-foreground">{r.secondary}</p> : null}
            </div>
            {canEdit ? <Button size="icon" variant="ghost" onClick={() => remove(r.id)} aria-label={t("common.delete")}><Trash2 /></Button> : null}
          </li>
        ))}
      </ul>
      {canEdit && !open ? (
        <Button variant="outline" size="sm" className="justify-self-start" onClick={() => setOpen(true)}>
          <Plus />{t(kind === "addresses" ? "customers.addAddress" : "customers.addContact")}
        </Button>
      ) : null}
      {open ? (
        <form onSubmit={add} className="grid gap-2 rounded-md border p-3 sm:grid-cols-2">
          {kind === "addresses" ? (
            <>
              <Input name="address" placeholder={t("fields.address")} required className="sm:col-span-2" />
              <Input name="label" placeholder={t("fields.label")} />
              <Input name="city" placeholder={t("fields.city")} />
              <Input name="governorate" placeholder={t("fields.governorate")} />
            </>
          ) : (
            <>
              <Input name="name" placeholder={t("common.name")} required />
              <Input name="role" placeholder={t("fields.role")} />
              <Input name="phone" placeholder={t("fields.phone")} dir="ltr" />
              <Input name="email" type="email" placeholder={t("fields.email")} dir="ltr" />
            </>
          )}
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" size="sm">{t("common.save")}</Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
