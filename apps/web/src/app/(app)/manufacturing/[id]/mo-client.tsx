"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, NativeSelect, Textarea } from "@/components/ui/primitives";
import { useI18n } from "@/components/i18n-provider";
import { api, ApiError } from "@/lib/api-client";

function useRun() {
  const { t } = useI18n();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<unknown>, after?: (r: unknown) => void) => {
    setBusy(true);
    try {
      const r = await fn();
      toast.success(t("common.saved"));
      after?.(r);
      router.refresh();
    } catch (err) {
      toast.error(t(err instanceof ApiError ? err.body.messageKey : "errors.internal", (err instanceof ApiError && !Array.isArray(err.body.details) ? (err.body.details as Record<string, string>) : undefined) ?? undefined));
      if (err instanceof ApiError && Array.isArray(err.body.details) && err.body.messageKey === "errors.insufficientStock") {
        const lines = (err.body.details as { name: string; available: string; requested: string }[]).map((d) => `${d.name}: ${d.available} / ${d.requested}`).join("\n");
        toast.error(lines);
      }
    } finally {
      setBusy(false);
    }
  };
  return { run, busy, router };
}

/** Create a draft issue (all outstanding requirements) or a return for one material. */
export function IssuePanel({ moId, warehouses, materials }: { moId: string; warehouses: { id: string; name: string }[]; materials: { id: string; name: string }[] }) {
  const { t } = useI18n();
  const { run, busy, router } = useRun();
  const [wh, setWh] = useState(warehouses[0]?.id ?? "");
  const [retMat, setRetMat] = useState(materials[0]?.id ?? "");
  const [retQty, setRetQty] = useState("");
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-end gap-2">
        <Field label={t("manufacturing.warehouse")}>
          <NativeSelect value={wh} onChange={(e) => setWh(e.target.value)} className="w-56">
            {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </NativeSelect>
        </Field>
        <Button disabled={busy || !wh} onClick={() => run(() => api<{ id: string }>(`/manufacturing-orders/${moId}/issues`, { body: { warehouseId: wh } }), (r) => router.push(`/material-issues/${(r as { id: string }).id}`))}>
          {t("manufacturing.issueMaterials")}
        </Button>
      </div>
      {materials.length ? (
        <div className="flex flex-wrap items-end gap-2">
          <Field label={t("manufacturing.returnMaterials")}>
            <NativeSelect value={retMat} onChange={(e) => setRetMat(e.target.value)} className="w-56">
              {materials.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </NativeSelect>
          </Field>
          <Input className="w-28" dir="ltr" type="number" min="0" step="any" value={retQty} onChange={(e) => setRetQty(e.target.value)} placeholder={t("docs.qty")} />
          <Button variant="outline" disabled={busy || !retQty || !wh} onClick={() => run(() => api<{ id: string }>(`/manufacturing-orders/${moId}/issues`, { body: { type: "RETURN", warehouseId: wh, lines: [{ materialId: retMat, quantity: Number(retQty) }] } }), (r) => router.push(`/material-issues/${(r as { id: string }).id}`))}>
            {t("manufacturing.returnMaterials")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function OperationActions({ opId, status, canEdit }: { opId: string; status: string; canEdit: boolean }) {
  const { t } = useI18n();
  const { run, busy } = useRun();
  if (!canEdit || status === "COMPLETED" || status === "SKIPPED") return null;
  const patch = (body: Record<string, unknown>) => run(() => api(`/operations/${opId}`, { method: "PATCH", body }));
  return (
    <div className="flex flex-wrap gap-1">
      {status === "PENDING" ? <Button size="sm" variant="outline" disabled={busy} onClick={() => patch({ action: "start" })}>{t("production.start")}</Button> : null}
      <Button size="sm" disabled={busy} onClick={() => {
        const h = window.prompt(t("production.hoursPrompt"), "");
        if (h === null) return;
        void patch({ action: "complete", ...(h.trim() ? { laborHours: Number(h) } : {}) });
      }}>{t("production.complete")}</Button>
      <Button size="sm" variant="ghost" disabled={busy} onClick={() => patch({ action: "skip" })}>{t("production.skip")}</Button>
      <Button size="sm" variant="ghost" disabled={busy} onClick={() => {
        const r = window.prompt(t("production.delayReason"));
        if (r) void patch({ action: "delay", delayReason: r });
      }}>{t("production.delay")}</Button>
    </div>
  );
}

export function QcForm({ moId, checklist, stages }: { moId: string; checklist: string[]; stages: { id: string; name: string }[] }) {
  const { t } = useI18n();
  const { run, busy } = useRun();
  const [result, setResult] = useState("PASSED");
  const [checks, setChecks] = useState(checklist.map((item) => ({ item, ok: true })));
  const [defects, setDefects] = useState("");
  const [notes, setNotes] = useState("");
  const [rework, setRework] = useState(stages[0]?.id ?? "");
  return (
    <div className="grid gap-3">
      <div className="grid gap-2 sm:grid-cols-2">
        {checks.map((c, i) => (
          <label key={i} className="flex items-center gap-2 text-sm">
            <Checkbox checked={c.ok} onChange={(e) => setChecks(checks.map((x, j) => (j === i ? { ...x, ok: e.target.checked } : x)))} />{c.item}
          </label>
        ))}
      </div>
      <Field label={t("quality.result")}>
        <NativeSelect value={result} onChange={(e) => setResult(e.target.value)} className="w-56">
          {["PASSED", "PASSED_WITH_NOTES", "FAILED"].map((r) => <option key={r} value={r}>{t(`status.QcResult.${r}`)}</option>)}
        </NativeSelect>
      </Field>
      {result === "FAILED" ? (
        <Field label={t("quality.reworkFrom")}>
          <NativeSelect value={rework} onChange={(e) => setRework(e.target.value)} className="w-56">
            {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </NativeSelect>
        </Field>
      ) : null}
      <Field label={t("quality.defects")}><Textarea value={defects} onChange={(e) => setDefects(e.target.value)} /></Field>
      <Field label={t("fields.notes")}><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      <div>
        <Button disabled={busy} variant={result === "FAILED" ? "destructive" : "default"} onClick={() => run(() => api(`/manufacturing-orders/${moId}/quality-checks`, { body: { result, checklist: checks, defects: defects || null, notes: notes || null, ...(result === "FAILED" && rework ? { reworkFromStageId: rework } : {}) } }))}>
          {t("quality.inspect")}
        </Button>
      </div>
    </div>
  );
}
