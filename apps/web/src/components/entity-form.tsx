"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, Checkbox, Field, Input, NativeSelect, Textarea } from "@/components/ui/primitives";
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
        setErrors(err.fieldErrors());
        setFormError(t(err.body.messageKey, (err.body.details as Record<string, string>) ?? undefined));
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
    <form onSubmit={onSubmit} className="grid gap-4">
      <Card>
        <CardContent className="grid gap-4 pt-5 sm:grid-cols-2 lg:grid-cols-3">
          <fieldset disabled={readOnly} className="contents">
            {fields.map((def) => {
              const id = `f-${def.name}`;
              const disabled = isEdit && def.disabledOnEdit;
              const span = def.span === 3 ? "sm:col-span-2 lg:col-span-3" : def.span === 2 ? "sm:col-span-2" : "";
              const error = errors[def.name] ? t("errors.validation") : null;
              if (def.type === "checkbox") {
                return (
                  <label key={def.name} className={cn("flex items-center gap-2 self-end pb-2 text-sm", span)}>
                    <Checkbox name={def.name} defaultChecked={Boolean(initial[def.name])} disabled={disabled} />
                    {t(def.label)}
                  </label>
                );
              }
              return (
                <Field key={def.name} label={<>{t(def.label)}{def.required ? <span className="text-destructive"> *</span> : null}</>} htmlFor={id} error={error} hint={def.hint ? t(def.hint) : undefined} className={span}>
                  {def.type === "textarea" ? (
                    <Textarea id={id} name={def.name} defaultValue={val(def.name)} required={def.required} dir={def.dir} rows={3} disabled={disabled} aria-invalid={Boolean(error)} />
                  ) : def.type === "select" ? (
                    <NativeSelect id={id} name={def.name} defaultValue={val(def.name)} required={def.required} disabled={disabled} aria-invalid={Boolean(error)}>
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
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={pending}>{submitLabel ? t(submitLabel) : t("common.save")}</Button>
          <Button type="button" variant="outline" onClick={() => router.back()}>{t("common.cancel")}</Button>
          {formError ? <p role="alert" className="text-sm text-destructive">{formError}</p> : null}
        </div>
      ) : null}
    </form>
  );
}
