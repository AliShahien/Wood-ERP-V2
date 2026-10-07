"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FileText, Paperclip, Trash2, Upload } from "@/components/ui/material-icons";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, NativeSelect } from "@/components/ui/primitives";
import { useI18n } from "@/components/i18n-provider";
import { api, ApiError } from "@/lib/api-client";
import { formatDate } from "@edge/i18n";

type Row = { id: string; fileName: string; mimeType: string; sizeBytes: number; category: string; createdAt: string };

export function AttachmentsPanel({ entityType, entityId, canUpload, canDelete, categories = ["DOCUMENT", "PHOTO", "DRAWING"] }: {
  entityType: string;
  entityId: string;
  canUpload: boolean;
  canDelete: boolean;
  categories?: string[];
}) {
  const { t, locale } = useI18n();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [category, setCategory] = useState(categories[0]!);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      setRows(await api<Row[]>(`/attachments?entityType=${entityType}&entityId=${entityId}`));
    } catch {
      setRows([]);
    }
  }, [entityType, entityId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.set("file", file);
        fd.set("entityType", entityType);
        fd.set("entityId", entityId);
        fd.set("category", category);
        const res = await fetch("/api/v1/attachments/upload", { method: "POST", body: fd, credentials: "same-origin" });
        if (!res.ok) {
          const e = await res.json().catch(() => null);
          throw new ApiError(res.status, e?.error ?? { code: "INTERNAL", messageKey: "errors.internal" });
        }
      }
      toast.success(t("common.saved"));
      await load();
    } catch (err) {
      toast.error(t(err instanceof ApiError ? err.body.messageKey : "errors.internal", (err instanceof ApiError ? (err.body.details as Record<string, string>) : undefined) ?? undefined));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function remove(id: string) {
    if (!confirm(t("common.areYouSure"))) return;
    try {
      await api(`/attachments/${id}`, { method: "DELETE" });
      await load();
    } catch (err) {
      toast.error(t(err instanceof ApiError ? err.body.messageKey : "errors.internal"));
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2"><Paperclip className="size-4" />{t("attachments.title")}</CardTitle>
        {canUpload ? (
          <div className="flex items-center gap-2">
            <NativeSelect value={category} onChange={(e) => setCategory(e.target.value)} className="h-8 w-32 text-xs">
              {categories.map((c) => <option key={c} value={c}>{t(`attachments.category.${c}`)}</option>)}
            </NativeSelect>
            <input ref={input} type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" onChange={(e) => upload(e.target.files)} />
            <Button size="sm" variant="outline" disabled={busy} onClick={() => input.current?.click()}><Upload />{t("attachments.upload")}</Button>
          </div>
        ) : null}
      </CardHeader>
      <CardContent>
        {rows === null ? (
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("attachments.empty")}</p>
        ) : (
          <ul className="divide-y">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center gap-3 py-2 text-sm">
                <FileText className="size-4 shrink-0 text-muted-foreground" />
                <a href={`/api/v1/attachments/${r.id}/download`} target="_blank" rel="noopener" className="min-w-0 flex-1 truncate hover:underline">{r.fileName}</a>
                <span className="text-xs text-muted-foreground">{t(`attachments.category.${r.category}`)}</span>
                <span className="num text-xs text-muted-foreground">{(r.sizeBytes / 1024).toFixed(0)} KB · {formatDate(locale, r.createdAt)}</span>
                {canDelete ? (
                  <Button size="icon" variant="ghost" onClick={() => remove(r.id)} aria-label={t("common.delete")}><Trash2 /></Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
