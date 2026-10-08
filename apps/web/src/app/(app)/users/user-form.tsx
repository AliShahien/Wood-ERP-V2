"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, Checkbox, Field, Input, NativeSelect } from "@/components/ui/primitives";
import { useI18n } from "@/components/i18n-provider";
import { api, ApiError } from "@/lib/api-client";

type Option = { id: string; code: string; name: string };
type RoleOption = { id: string; code: string; nameAr: string; nameEn: string };

export interface UserFormValues {
  id?: string;
  fullName: string;
  username: string;
  email: string | null;
  phone: string | null;
  department: string | null;
  showroomId: string | null;
  locale: "ar" | "en";
  roleIds: string[];
  warehouseIds: string[];
}

export function UserForm({ initial, roles, showrooms, warehouses }: {
  initial?: UserFormValues;
  roles: RoleOption[];
  showrooms: Option[];
  warehouses: Option[];
}) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const isEdit = Boolean(initial?.id);
  const [roleIds, setRoleIds] = useState<string[]>(initial?.roleIds ?? []);
  const [warehouseIds, setWarehouseIds] = useState<string[]>(initial?.warehouseIds ?? []);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const toggle = (list: string[], set: (v: string[]) => void, id: string) =>
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const body: Record<string, unknown> = {
      fullName: f.get("fullName"),
      email: f.get("email") || null,
      phone: f.get("phone") || null,
      department: f.get("department") || null,
      showroomId: f.get("showroomId") || null,
      locale: f.get("locale"),
      roleIds,
      warehouseIds,
    };
    if (!isEdit) {
      body.username = f.get("username");
      body.password = f.get("password");
      body.mustChangePassword = f.get("mustChangePassword") === "on";
    }
    setPending(true);
    setErrors({});
    setFormError(null);
    try {
      const saved = await api<{ id: string }>(isEdit ? `/users/${initial!.id}` : "/users", { method: isEdit ? "PATCH" : "POST", body });
      toast.success(t("common.saved"));
      router.push(`/users/${saved.id}`);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fieldErrors());
        setFormError(t(err.body.messageKey));
      } else setFormError(t("errors.internal"));
    } finally {
      setPending(false);
    }
  }

  const err = (k: string) => (errors[k] ? t("errors.validation") : null);

  return (
    <form onSubmit={onSubmit} className="grid max-w-6xl gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
      <Card>
        <CardHeader><CardTitle>{t(isEdit ? "common.edit" : "common.create")}</CardTitle></CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          <Field label={t("users.fullName")} htmlFor="fullName" error={err("fullName")}>
            <Input id="fullName" name="fullName" defaultValue={initial?.fullName} required maxLength={150} />
          </Field>
          <Field label={t("users.username")} htmlFor="username" error={err("username")}>
            <Input id="username" name="username" defaultValue={initial?.username} required disabled={isEdit} dir="ltr" pattern="[a-zA-Z0-9._\-]+" minLength={3} />
          </Field>
          <Field label={t("users.email")} htmlFor="email" error={err("email")}>
            <Input id="email" name="email" type="email" defaultValue={initial?.email ?? ""} dir="ltr" />
          </Field>
          <Field label={t("users.phone")} htmlFor="phone" error={err("phone")}>
            <Input id="phone" name="phone" type="tel" defaultValue={initial?.phone ?? ""} dir="ltr" />
          </Field>
          <Field label={t("users.department")} htmlFor="department">
            <Input id="department" name="department" defaultValue={initial?.department ?? ""} />
          </Field>
          <Field label={t("users.showroom")} htmlFor="showroomId">
            <NativeSelect id="showroomId" name="showroomId" defaultValue={initial?.showroomId ?? ""}>
              <option value="">{t("users.noShowroom")}</option>
              {showrooms.map((s) => <option key={s.id} value={s.id}>{s.code} — {s.name}</option>)}
            </NativeSelect>
          </Field>
          <Field label={t("users.locale")} htmlFor="locale">
            <NativeSelect id="locale" name="locale" defaultValue={initial?.locale ?? "ar"}>
              <option value="ar">{t("common.arabic")}</option>
              <option value="en">{t("common.english")}</option>
            </NativeSelect>
          </Field>
          {!isEdit ? (
            <>
              <Field label={t("users.initialPassword")} htmlFor="password" hint={t("auth.passwordHint")} error={err("password")}>
                <Input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" dir="ltr" />
              </Field>
              <label className="flex min-h-12 items-center gap-3 rounded-xl border bg-muted/40 px-4 text-sm font-medium sm:col-span-2">
                <Checkbox name="mustChangePassword" defaultChecked />
                {t("users.mustChange")}
              </label>
            </>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid content-start gap-4">
        <Card>
          <CardHeader><CardTitle>{t("users.roles")}</CardTitle></CardHeader>
          <CardContent className="grid gap-2">
            {roles.map((r) => (
              <label key={r.id} className="flex min-h-11 items-center gap-3 rounded-xl border bg-muted/30 px-3 text-sm hover:bg-muted/60">
                <Checkbox checked={roleIds.includes(r.id)} onChange={() => toggle(roleIds, setRoleIds, r.id)} />
                {locale === "ar" ? r.nameAr : r.nameEn}
              </label>
            ))}
            {errors.roleIds ? <p className="text-xs text-destructive">{t("errors.validation")}</p> : null}
          </CardContent>
        </Card>
        {warehouses.length ? (
          <Card>
            <CardHeader><CardTitle>{t("users.warehouses")}</CardTitle></CardHeader>
            <CardContent className="grid gap-2">
              {warehouses.map((w) => (
                <label key={w.id} className="flex min-h-11 items-center gap-3 rounded-xl border bg-muted/30 px-3 text-sm hover:bg-muted/60">
                  <Checkbox checked={warehouseIds.includes(w.id)} onChange={() => toggle(warehouseIds, setWarehouseIds, w.id)} />
                  {w.name}
                </label>
              ))}
            </CardContent>
          </Card>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-3 lg:col-span-2">
        <Button type="submit" disabled={pending}>{t("common.save")}</Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>{t("common.cancel")}</Button>
        {formError ? <p role="alert" className="text-sm text-destructive">{formError}</p> : null}
      </div>
    </form>
  );
}
