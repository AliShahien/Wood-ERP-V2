"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, Field, Input, NativeSelect, Textarea } from "@/components/ui/primitives";
import { useI18n } from "@/components/i18n-provider";
import { SearchPicker, type PickItem } from "@/components/search-picker";
import { api, ApiError } from "@/lib/api-client";

export interface MeasurementValues {
  width: string; height: string; thickness: string; wallThickness: string; openingType: string; openingDirection: string;
  frameDetails: string; installationNotes: string; notes: string; location: string; room: string;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <Card><CardHeader><CardTitle>{title}</CardTitle></CardHeader><CardContent className="grid gap-4 sm:grid-cols-2">{children}</CardContent></Card>;
}

const OPENING_TYPES =["Single", "Double", "Sliding", "Folding", "Pivot"];
const DIRECTIONS = ["Left in", "Right in", "Left out", "Right out"];

/** Sectioned, large-target form for tablets on site. `measurementId` set = revise existing. */
export function MeasurementForm({ measurementId, initial, customer: initialCustomer, product: initialProduct, quotationId, approvedLocked }: {
  measurementId?: string;
  initial: MeasurementValues;
  customer: PickItem | null;
  product: PickItem | null;
  quotationId?: string | null;
  approvedLocked?: boolean;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [customer, setCustomer] = useState(initialCustomer);
  const [product, setProduct] = useState(initialProduct);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    const num = (v: string | undefined) => (v ? Number(v) : null);
    const body: Record<string, unknown> = {
      width: Number(f.width), height: Number(f.height), thickness: num(f.thickness), wallThickness: num(f.wallThickness),
      openingType: f.openingType || null, openingDirection: f.openingDirection || null, frameDetails: f.frameDetails || null,
      installationNotes: f.installationNotes || null, notes: f.notes || null,
    };
    if (measurementId) body.changeReason = f.changeReason || null;
    else Object.assign(body, { customerId: customer?.id, productId: product?.id ?? null, quotationId: quotationId ?? null, location: f.location || null, room: f.room || null });
    if (!measurementId && !customer) return toast.error(t("quotations.noCustomer"));
    setPending(true);
    try {
      const res = await api<{ id: string }>(measurementId ? `/measurements/${measurementId}` : "/measurements", { method: measurementId ? "PUT" : "POST", body });
      toast.success(t("common.saved"));
      router.push(`/measurements/${res.id}`);
      router.refresh();
    } catch (err) {
      toast.error(t(err instanceof ApiError ? err.body.messageKey : "errors.internal"));
    } finally {
      setPending(false);
    }
  }

  const big = "h-11 text-base";

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      {!measurementId ? (
        <>
          <Section title={t("measurements.sections.customer")}>
            <div className="sm:col-span-2">
              <SearchPicker endpoint="/customers?status=ACTIVE" map={(r) => ({ id: String(r.id), label: String(r.name), sub: [r.code, r.phone].filter(Boolean).join(" · ") })} value={customer} onChange={setCustomer} placeholder={t("quotations.selectCustomer")} />
            </div>
          </Section>
          <Section title={t("measurements.sections.product")}>
            <div className="sm:col-span-2">
              <SearchPicker endpoint="/products?status=ACTIVE" map={(r) => ({ id: String(r.id), label: String(r.name), sub: String(r.code) })} value={product} onChange={setProduct} placeholder={t("common.searchPlaceholder")} />
            </div>
          </Section>
          <Section title={t("measurements.sections.location")}>
            <Field label={t("measurements.location")}><Input name="location" defaultValue={initial.location} className={big} /></Field>
            <Field label={t("measurements.room")}><Input name="room" defaultValue={initial.room} className={big} /></Field>
          </Section>
        </>
      ) : null}
      {approvedLocked ? <p className="rounded-md bg-warning/15 px-3 py-2 text-sm">{t("measurements.approvedLocked")}</p> : null}
      <Section title={t("measurements.sections.dimensions")}>
        <Field label={t("measurements.width")}><Input name="width" type="number" inputMode="decimal" step="0.1" min="1" required dir="ltr" defaultValue={initial.width} className={big} /></Field>
        <Field label={t("measurements.height")}><Input name="height" type="number" inputMode="decimal" step="0.1" min="1" required dir="ltr" defaultValue={initial.height} className={big} /></Field>
        <Field label={t("measurements.thickness")}><Input name="thickness" type="number" inputMode="decimal" step="0.1" dir="ltr" defaultValue={initial.thickness} className={big} /></Field>
        <Field label={t("measurements.wallThickness")}><Input name="wallThickness" type="number" inputMode="decimal" step="0.1" dir="ltr" defaultValue={initial.wallThickness} className={big} /></Field>
      </Section>
      <Section title={t("measurements.sections.opening")}>
        <Field label={t("measurements.openingType")}>
          <NativeSelect name="openingType" defaultValue={initial.openingType} className={big}>
            <option value="">{t("common.select")}</option>
            {OPENING_TYPES.map((o) => <option key={o} value={o}>{o}</option>)}
          </NativeSelect>
        </Field>
        <Field label={t("measurements.openingDirection")}>
          <NativeSelect name="openingDirection" defaultValue={initial.openingDirection} className={big}>
            <option value="">{t("common.select")}</option>
            {DIRECTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
          </NativeSelect>
        </Field>
      </Section>
      <Section title={t("measurements.sections.frame")}>
        <Field label={t("measurements.frameDetails")} className="sm:col-span-2"><Textarea name="frameDetails" defaultValue={initial.frameDetails} /></Field>
      </Section>
      <Section title={t("measurements.sections.installation")}>
        <Field label={t("measurements.installationNotes")} className="sm:col-span-2"><Textarea name="installationNotes" defaultValue={initial.installationNotes} /></Field>
      </Section>
      <Section title={t("measurements.sections.notes")}>
        <Field label={t("fields.notes")} className="sm:col-span-2"><Textarea name="notes" defaultValue={initial.notes} /></Field>
        {approvedLocked ? <Field label={t("measurements.changeReason")} className="sm:col-span-2"><Input name="changeReason" required className={big} /></Field> : null}
      </Section>
      <div><Button type="submit" size="lg" disabled={pending}>{approvedLocked ? t("measurements.newVersion") : t("common.save")}</Button></div>
    </form>
  );
}
