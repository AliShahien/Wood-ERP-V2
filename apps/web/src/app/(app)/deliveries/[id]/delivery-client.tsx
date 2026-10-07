"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input, NativeSelect } from "@/components/ui/primitives";
import { useI18n } from "@/components/i18n-provider";
import { api, ApiError } from "@/lib/api-client";

function useAction() {
  const { t } = useI18n();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      toast.success(t("common.saved"));
      router.refresh();
    } catch (err) {
      toast.error(t(err instanceof ApiError ? err.body.messageKey : "errors.internal"));
    } finally {
      setBusy(false);
    }
  };
  return { run, busy };
}

export function ScheduleForm({ id, initial }: { id: string; initial: { scheduledDate: string; driverName: string; vehicle: string; address: string } }) {
  const { t } = useI18n();
  const { run, busy } = useAction();
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    await run(() => api(`/deliveries/${id}/schedule`, { body: { scheduledDate: f.scheduledDate, driverName: f.driverName || null, vehicle: f.vehicle || null, address: f.address || null } }));
  }
  return (
    <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
      <Field label={t("deliveries.scheduledDate")}><Input name="scheduledDate" type="datetime-local" dir="ltr" required defaultValue={initial.scheduledDate} /></Field>
      <Field label={t("deliveries.driver")}><Input name="driverName" defaultValue={initial.driverName} /></Field>
      <Field label={t("deliveries.vehicle")}><Input name="vehicle" defaultValue={initial.vehicle} /></Field>
      <Field label={t("deliveries.address")}><Input name="address" defaultValue={initial.address} /></Field>
      <div><Button type="submit" variant="secondary" disabled={busy}>{t("deliveries.schedule")}</Button></div>
    </form>
  );
}

export function CompleteForm({ id, lines, installationRequired }: { id: string; lines: { id: string; label: string; quantity: number }[]; installationRequired: boolean }) {
  const { t } = useI18n();
  const { run, busy } = useAction();
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await run(() => api(`/deliveries/${id}/complete`, {
      body: {
        receivedByName: f.get("receivedByName"),
        installationStatus: installationRequired ? f.get("installationStatus") : undefined,
        lines: lines.map((l) => ({ deliveryItemId: l.id, deliveredQuantity: Number(f.get(`q-${l.id}`)) })),
      },
    }));
  }
  return (
    <form onSubmit={onSubmit} className="grid gap-3">
      {lines.map((l) => (
        <div key={l.id} className="grid grid-cols-[1fr_120px] items-center gap-2 text-sm">
          <span>{l.label}</span>
          <Input name={`q-${l.id}`} type="number" dir="ltr" min={0} max={l.quantity} step="any" defaultValue={l.quantity} className="h-11 text-base" />
        </div>
      ))}
      <Field label={t("deliveries.receivedBy")}><Input name="receivedByName" required className="h-11 text-base" /></Field>
      {installationRequired ? (
        <Field label={t("deliveries.installation")}>
          <NativeSelect name="installationStatus" defaultValue="PENDING" className="h-11">
            {["PENDING", "IN_PROGRESS", "COMPLETED"].map((s) => <option key={s} value={s}>{t(`status.InstallationStatus.${s}`)}</option>)}
          </NativeSelect>
        </Field>
      ) : null}
      <div><Button type="submit" size="lg" disabled={busy}>{t("deliveries.complete")}</Button></div>
    </form>
  );
}

export function InstallationControl({ id, value }: { id: string; value: string }) {
  const { t } = useI18n();
  const { run, busy } = useAction();
  return (
    <NativeSelect value={value} disabled={busy} className="w-48" onChange={(e) => run(() => api(`/deliveries/${id}/installation`, { body: { installationStatus: e.target.value } }))}>
      {["PENDING", "IN_PROGRESS", "COMPLETED"].map((s) => <option key={s} value={s}>{t(`status.InstallationStatus.${s}`)}</option>)}
    </NativeSelect>
  );
}

/** Canvas signature pad (pointer events → works with finger, stylus and mouse). */
export function SignaturePad({ id, existingId }: { id: string; existingId: string | null }) {
  const { t } = useI18n();
  const router = useRouter();
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const c = canvas.current!;
    const ratio = window.devicePixelRatio || 1;
    c.width = c.offsetWidth * ratio;
    c.height = c.offsetHeight * ratio;
    const g = c.getContext("2d")!;
    g.scale(ratio, ratio);
    g.lineWidth = 2.2;
    g.lineCap = "round";
    g.strokeStyle = "#1f1a16";
    g.fillStyle = "#fff";
    g.fillRect(0, 0, c.width, c.height);
  }, []);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  async function save() {
    const c = canvas.current!;
    const blob: Blob | null = await new Promise((res) => c.toBlob(res, "image/png"));
    if (!blob) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("file", blob, "signature.png");
      const r = await fetch(`/api/v1/deliveries/${id}/signature`, { method: "POST", body: fd, credentials: "same-origin" });
      if (!r.ok) throw new Error();
      toast.success(t("deliveries.signatureSaved"));
      router.refresh();
    } catch {
      toast.error(t("errors.internal"));
    } finally {
      setBusy(false);
    }
  }

  function clear() {
    const c = canvas.current!;
    const g = c.getContext("2d")!;
    g.fillRect(0, 0, c.width, c.height);
    setDirty(false);
  }

  return (
    <div className="grid gap-2">
      {existingId ? <img src={`/api/v1/attachments/${existingId}/download`} alt={t("deliveries.signature")} className="h-32 w-full rounded border bg-white object-contain" /> : null}
      <canvas
        ref={canvas}
        className="h-40 w-full touch-none rounded-md border bg-white"
        onPointerDown={(e) => { drawing.current = true; const p = pos(e); const g = e.currentTarget.getContext("2d")!; g.beginPath(); g.moveTo(p.x, p.y); e.currentTarget.setPointerCapture(e.pointerId); }}
        onPointerMove={(e) => { if (!drawing.current) return; const p = pos(e); const g = e.currentTarget.getContext("2d")!; g.lineTo(p.x, p.y); g.stroke(); setDirty(true); }}
        onPointerUp={() => { drawing.current = false; }}
      />
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" onClick={clear}>{t("deliveries.clear")}</Button>
        <Button type="button" size="sm" disabled={!dirty || busy} onClick={save}>{t("deliveries.saveSignature")}</Button>
      </div>
    </div>
  );
}
