"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, Checkbox, Field, Input, NativeSelect, Textarea } from "@/components/ui/primitives";
import { useI18n } from "@/components/i18n-provider";
import { api, ApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";

export type FieldDef = {
  name: string;
  label: string; // i18n key
  type?: "text" | "number" | "email" | "tel" | "textarea" | "select" | "checkbox" | "date";
  required?: boolean;
  options?: { value: string; label: string; raw?: boolean }[]; // label is an i18n key unless raw
  dir?: "ltr" | "rtl";
  span?: 1 | 2 | 3;
  hint?: string;
  min?: number;
  max?: number;
  step?: string;
  disabledOnEdit?: boolean;
  emptyOption?: string; // i18n key for "none"
  placeholder?: string;
};

/**
 * Config-driven create/edit form posting JSON to the REST API.
 * `redirectTo` may contain ":id" which is replaced with the saved record id.
 */
export function EntityForm({ fields, endpoint, method, initial = {}, redirectTo, isEdit = false, readOnly = false, extra, submitLabel }: {
  fields: FieldDef[];
  endpoint: string;
  method: "POST" | "PATCH";
  initial?: Record<string, unknown>;
  redirectTo?: string;
  isEdit?: boolean;
  readOnly?: boolean;
  extra?: ReactNode;
  submitLabel?: string;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const body: Record<string, unknown> = {};
    for (const def of fields) {
      if (isEdit && def.disabledOnEdit) continue;
      if (def.type === "checkbox") body[def.name] = f.get(def.name) === "on";
      else {
        const raw = f.get(def.name);
        const v = typeof raw === "string" ? raw.trim() : "";
        if (def.type === "number") body[def.name] = v === "" ? null : Number(v);
        else body[def.name] = v === "" ? null : v;
      }
    }
    setPending(true);
    setErrors({});
    setFormError(null);
    try {
      const saved = await api<{ id: string }>(endpoint, { method, body });
      toast.success(t("common.saved"));
      if (redirectTo) router.push(redirectTo.replace(":id", saved.id));
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        const fieldErrors = err.fieldErrors();
        setErrors(fieldErrors);
        setFormError(t(err.body.messageKey, (err.body.details as Record<string, string>) ?? undefined));
        const first = Object.keys(fieldErrors)[0];
        if (first) requestAnimationFrame(() => document.getElementById(`f-${first}`)?.focus());
      } else setFormError(t("errors.internal"));
    } finally {
      setPending(false);
    }
  }

  const val = (name: string) => {
    const v = initial[name];
    return v === null || v === undefined ? "" : String(v);
  };

  return (
    <form onSubmit={onSubmit} className="grid w-full max-w-5xl gap-5">
      <Card>
        <CardHeader className="border-b bg-muted/30 px-5 py-4 sm:px-7">
          <CardTitle>{t(isEdit ? "common.edit" : "common.create")}</CardTitle>
        </CardHeader>
        <CardContent className="p-5 pt-5 sm:p-7 sm:pt-7">
          <fieldset disabled={readOnly} className="grid min-w-0 gap-x-5 gap-y-5 sm:grid-cols-2">
            {fields.map((def) => {
              const id = `f-${def.name}`;
              const disabled = isEdit && def.disabledOnEdit;
              const span = def.span && def.span > 1 ? "sm:col-span-2" : "";
              const error = errors[def.name] ? t("errors.validation") : null;
              if (def.type === "checkbox") {
                return (
                  <label key={def.name} className={cn("flex min-h-12 items-center gap-3 self-end rounded-xl border bg-muted/40 px-4 py-3 text-sm font-medium", span)}>
                    <Checkbox name={def.name} defaultChecked={Boolean(initial[def.name])} disabled={disabled} />
                    {t(def.label)}
                  </label>
                );
              }
              return (
                <Field key={def.name} label={<>{t(def.label)}{def.required ? <span className="text-destructive"> *</span> : null}</>} htmlFor={id} error={error} errorId={`${id}-error`} hint={def.hint ? t(def.hint) : undefined} className={span}>
                  {def.type === "textarea" ? (
                    <Textarea id={id} name={def.name} defaultValue={val(def.name)} required={def.required} dir={def.dir} rows={3} disabled={disabled} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} />
                  ) : def.type === "select" ? (
                    <NativeSelect id={id} name={def.name} defaultValue={val(def.name)} required={def.required} disabled={disabled} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined}>
                      {def.emptyOption || !def.required ? <option value="">{t(def.emptyOption ?? "common.select")}</option> : null}
                      {def.options?.map((o) => <option key={o.value} value={o.value}>{o.raw ? o.label : t(o.label)}</option>)}
                    </NativeSelect>
                  ) : (
                    <Input
                      id={id}
                      name={def.name}
                      type={def.type ?? "text"}
                      defaultValue={def.type === "date" ? val(def.name).slice(0, 10) : val(def.name)}
                      required={def.required}
                      dir={def.dir ?? (def.type === "number" || def.type === "email" || def.type === "tel" ? "ltr" : undefined)}
                      min={def.min}
                      max={def.max}
                      step={def.step ?? (def.type === "number" ? "any" : undefined)}
                      disabled={disabled}
                      placeholder={def.placeholder ? t(def.placeholder) : undefined}
                      aria-invalid={Boolean(error)}
                      aria-describedby={error ? `${id}-error` : undefined}
                    />
                  )}
                </Field>
              );
            })}
          </fieldset>
        </CardContent>
      </Card>
      {extra}
      {!readOnly ? (
        <div className="flex flex-col gap-3 rounded-2xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          {formError ? <p role="alert" className="text-sm text-destructive">{formError}</p> : <span />}
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" variant="outline" onClick={() => router.back()}>{t("common.cancel")}</Button>
            <Button type="submit" disabled={pending}>{submitLabel ? t(submitLabel) : t("common.save")}</Button>
          </div>
        </div>
      ) : null}
    </form>
  );
}
