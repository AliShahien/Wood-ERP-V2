"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Star, Trash2, Upload } from "@/components/ui/material-icons";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/primitives";
import { useI18n } from "@/components/i18n-provider";
import { api, ApiError } from "@/lib/api-client";

type Img = { id: string; isMain: boolean };

export function ImageManager({ productId, images, canEdit }: { productId: string; images: Img[]; canEdit: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const fail = (err: unknown) =>
    toast.error(t(err instanceof ApiError ? err.body.messageKey : "errors.internal", (err instanceof ApiError ? (err.body.details as Record<string, string>) : undefined) ?? undefined));

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.set("file", file);
        const res = await fetch(`/api/v1/products/${productId}/images`, { method: "POST", body: fd, credentials: "same-origin" });
        if (!res.ok) {
          const e = await res.json().catch(() => null);
          throw new ApiError(res.status, e?.error ?? { code: "INTERNAL", messageKey: "errors.internal" });
        }
      }
      router.refresh();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function setMain(id: string) {
    try {
      await api(`/products/${productId}/images/${id}/main`, { method: "POST", body: {} });
      router.refresh();
    } catch (err) {
      fail(err);
    }
  }

  async function remove(id: string) {
    if (!confirm(t("common.areYouSure"))) return;
    try {
      await api(`/products/${productId}/images/${id}`, { method: "DELETE" });
      router.refresh();
    } catch (err) {
      fail(err);
    }
  }

  return (
    <div className="grid gap-3">
      {images.length === 0 ? <p className="text-sm text-muted-foreground">{t("products.noImage")}</p> : null}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        {images.map((img) => (
          <figure key={img.id} className="group relative overflow-hidden rounded-md border bg-muted">
            <img src={`/api/v1/product-images/${img.id}`} alt="" className="aspect-[3/4] w-full object-cover" loading="lazy" />
            {img.isMain ? <Badge tone="info" className="absolute start-2 top-2">{t("products.main")}</Badge> : null}
            {canEdit ? (
              <figcaption className="absolute inset-x-0 bottom-0 flex justify-end gap-1 bg-black/40 p-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
                {!img.isMain ? (
                  <Button size="icon" variant="ghost" className="size-8 text-white hover:bg-white/20" onClick={() => setMain(img.id)} aria-label={t("products.setMain")} title={t("products.setMain")}><Star /></Button>
                ) : null}
                <Button size="icon" variant="ghost" className="size-8 text-white hover:bg-white/20" onClick={() => remove(img.id)} aria-label={t("common.delete")}><Trash2 /></Button>
              </figcaption>
            ) : null}
          </figure>
        ))}
      </div>
      {canEdit ? (
        <div>
          <input ref={input} type="file" multiple accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => upload(e.target.files)} />
          <Button variant="outline" disabled={busy} onClick={() => input.current?.click()}><Upload />{t("products.uploadImages")}</Button>
        </div>
      ) : null}
    </div>
  );
}
