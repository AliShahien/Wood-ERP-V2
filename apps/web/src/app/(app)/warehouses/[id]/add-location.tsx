"use client";

import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/primitives";
import { useI18n } from "@/components/i18n-provider";
import { api, ApiError } from "@/lib/api-client";

export function AddLocation({ warehouseId }: { warehouseId: string }) {
  const { t } = useI18n();
  const router = useRouter();
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    try {
      await api(`/warehouses/${warehouseId}/locations`, { body: { code: f.get("code"), name: f.get("name") } });
      form.reset();
      router.refresh();
    } catch (err) {
      toast.error(t(err instanceof ApiError ? err.body.messageKey : "errors.internal"));
    }
  }
  return (
    <form onSubmit={onSubmit} className="flex flex-wrap gap-2">
      <Input name="code" placeholder={t("common.code")} required dir="ltr" className="w-32" />
      <Input name="name" placeholder={t("common.name")} required className="w-56" />
      <Button type="submit" variant="outline">{t("warehouses.addLocation")}</Button>
    </form>
  );
}
