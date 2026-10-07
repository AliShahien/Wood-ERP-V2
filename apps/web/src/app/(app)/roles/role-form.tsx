"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, Checkbox, Field, Input, NativeSelect, Textarea } from "@/components/ui/primitives";
import { useI18n } from "@/components/i18n-provider";
import { api, ApiError } from "@/lib/api-client";

export interface RoleFormValues {
  id?: string;
  code: string;
  nameAr: string;
  nameEn: string;
  description: string | null;
  dataScope: "ALL" | "SHOWROOM" | "OWN";
  permissions: string[];
  isSystem?: boolean;
  usersCount?: number;
}

export function RoleForm({ initial, catalog, readOnly, canDelete }: { initial?: RoleFormValues; catalog: string[]; readOnly: boolean; canDelete: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set(initial?.permissions ?? []));
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const isEdit = Boolean(initial?.id);

  // module -> actions, preserving catalog order
  const modules = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const key of catalog) {
      const [m, a] = key.split(".") as [string, string];
      map.set(m, [...(map.get(m) ?? []), a]);
    }
    return [...map.entries()];
  }, [catalog]);

  const toggle = (key: string) => setSelected((s) => {
    const n = new Set(s);
    if (n.has(key)) n.delete(key);
    else n.add(key);
    return n;
  });
  const toggleModule = (m: string, actions: string[]) => setSelected((s) => {
    const n = new Set(s);
    const all = actions.every((a) => n.has(`${m}.${a}`));
    for (const a of actions) {
      if (all) n.delete(`${m}.${a}`);
      else n.add(`${m}.${a}`);
    }
    return n;
  });

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const body: Record<string, unknown> = {
      nameAr: f.get("nameAr"),
      nameEn: f.get("nameEn"),
      description: f.get("description") || null,
      dataScope: f.get("dataScope"),
      permissions: [...selected],
    };
    if (!isEdit) body.code = f.get("code");
    setPending(true);
    setError(null);
    try {
      const saved = await api<{ id: string }>(isEdit ? `/roles/${initial!.id}` : "/roles", { method: isEdit ? "PATCH" : "POST", body });
      toast.success(t("common.saved"));
      router.push(`/roles/${saved.id}`);
      router.refresh();
    } catch (err) {
      setError(t(err instanceof ApiError ? err.body.messageKey : "errors.internal"));
    } finally {
      setPending(false);
    }
  }

  async function onDelete() {
    if (!confirm(t("common.areYouSure"))) return;
    try {
      await api(`/roles/${initial!.id}`, { method: "DELETE" });
      router.push("/roles");
      router.refresh();
    } catch (err) {
      toast.error(t(err instanceof ApiError ? err.body.messageKey : "errors.internal"));
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <Card>
        <CardContent className="grid gap-4 pt-5 sm:grid-cols-2 lg:grid-cols-4">
          <Field label={t("common.code")} htmlFor="code">
            <Input id="code" name="code" defaultValue={initial?.code} required disabled={isEdit || readOnly} dir="ltr" pattern="[A-Za-z0-9_]+" />
          </Field>
          <Field label={t("roles.nameAr")} htmlFor="nameAr">
            <Input id="nameAr" name="nameAr" defaultValue={initial?.nameAr} required disabled={readOnly} dir="rtl" />
          </Field>
          <Field label={t("roles.nameEn")} htmlFor="nameEn">
            <Input id="nameEn" name="nameEn" defaultValue={initial?.nameEn} required disabled={readOnly} dir="ltr" />
          </Field>
          <Field label={t("roles.dataScope")} htmlFor="dataScope">
            <NativeSelect id="dataScope" name="dataScope" defaultValue={initial?.dataScope ?? "OWN"} disabled={readOnly}>
              {(["ALL", "SHOWROOM", "OWN"] as const).map((s) => <option key={s} value={s}>{t(`scope.${s}`)}</option>)}
            </NativeSelect>
          </Field>
          <Field label={t("roles.description")} htmlFor="description" className="sm:col-span-2 lg:col-span-4">
            <Textarea id="description" name="description" defaultValue={initial?.description ?? ""} disabled={readOnly} rows={2} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{t("roles.permissions")}</CardTitle></CardHeader>
        <CardContent className="grid gap-0 divide-y">
          {modules.map(([m, actions]) => {
            const all = actions.every((a) => selected.has(`${m}.${a}`));
            return (
              <div key={m} className="grid gap-2 py-3 sm:grid-cols-[220px_1fr] sm:items-start">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <Checkbox checked={all} disabled={readOnly} onChange={() => toggleModule(m, actions)} aria-label={t("roles.selectAll")} />
                  {t(`permissions.modules.${m}`)}
                </label>
                <div className="flex flex-wrap gap-x-5 gap-y-2">
                  {actions.map((a) => {
                    const key = `${m}.${a}`;
                    return (
                      <label key={key} className="flex items-center gap-1.5 text-sm text-muted-foreground" title={key}>
                        <Checkbox checked={selected.has(key)} disabled={readOnly} onChange={() => toggle(key)} />
                        {t(`permissions.actions.${a}`)}
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {!readOnly ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={pending}>{t("common.save")}</Button>
          <Button type="button" variant="outline" onClick={() => router.back()}>{t("common.cancel")}</Button>
          {isEdit && canDelete && !initial?.isSystem && !initial?.usersCount ? (
            <Button type="button" variant="destructive" className="ms-auto" onClick={onDelete}>{t("common.delete")}</Button>
          ) : null}
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        </div>
      ) : null}
    </form>
  );
}
