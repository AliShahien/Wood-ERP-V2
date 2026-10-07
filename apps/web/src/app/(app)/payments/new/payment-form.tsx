"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, Field, Input, NativeSelect, Textarea } from "@/components/ui/primitives";
import { useI18n } from "@/components/i18n-provider";
import { SearchPicker, type PickItem } from "@/components/search-picker";
import { api, ApiError } from "@/lib/api-client";

type Order = { id: string; number: string; total: string };

export function PaymentForm({ accounts, initialCustomer, orders: initialOrders, initialSalesOrderId }: {
  accounts: { id: string; name: string; type: string }[];
  initialCustomer: PickItem | null;
  orders: Order[];
  initialSalesOrderId: string;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [customer, setCustomer] = useState<PickItem | null>(initialCustomer);
  const [orders, setOrders] = useState<Order[]>(initialOrders);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!customer || customer.id === initialCustomer?.id) return;
    api<{ items: Order[] }>(`/sales-orders?customerId=${customer.id}&pageSize=50`).then((r) => setOrders(r.items)).catch(() => setOrders([]));
  }, [customer, initialCustomer]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!customer) return toast.error(t("quotations.noCustomer"));
    const f = new FormData(e.currentTarget);
    setPending(true);
    try {
      const p = await api<{ id: string }>("/payments", {
        body: {
          customerId: customer.id, salesOrderId: f.get("salesOrderId") || null, cashAccountId: f.get("cashAccountId"),
          amount: Number(f.get("amount")), method: f.get("method"), paymentDate: f.get("paymentDate") || undefined,
          reference: f.get("reference") || null, notes: f.get("notes") || null,
        },
      });
      toast.success(t("common.saved"));
      router.push(`/payments/${p.id}`);
    } catch (err) {
      toast.error(t(err instanceof ApiError ? err.body.messageKey : "errors.internal"));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid max-w-3xl gap-4">
      <Card>
        <CardContent className="grid gap-4 pt-5 sm:grid-cols-2">
          <Field label={t("quotations.customer")} className="sm:col-span-2">
            <SearchPicker endpoint="/customers" map={(r) => ({ id: String(r.id), label: String(r.name), sub: String(r.code) })} value={customer} onChange={setCustomer} placeholder={t("quotations.selectCustomer")} />
          </Field>
          <Field label={t("payments.salesOrder")}>
            <NativeSelect name="salesOrderId" defaultValue={initialSalesOrderId}>
              <option value="">{t("fields.none")}</option>
              {orders.map((o) => <option key={o.id} value={o.id}>{o.number}</option>)}
            </NativeSelect>
          </Field>
          <Field label={t("payments.amount")}><Input name="amount" type="number" min="0.01" step="0.01" required dir="ltr" /></Field>
          <Field label={t("payments.method")}>
            <NativeSelect name="method" required defaultValue="CASH">
              {["CASH", "BANK_TRANSFER", "CARD", "OTHER"].map((m) => <option key={m} value={m}>{t(`status.PaymentMethod.${m}`)}</option>)}
            </NativeSelect>
          </Field>
          <Field label={t("payments.account")}>
            <NativeSelect name="cashAccountId" required>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({t(`status.CashAccountType.${a.type}`)})</option>)}
            </NativeSelect>
          </Field>
          <Field label={t("payments.date")}><Input name="paymentDate" type="date" dir="ltr" defaultValue={new Date().toISOString().slice(0, 10)} /></Field>
          <Field label={t("payments.reference")}><Input name="reference" dir="ltr" /></Field>
          <Field label={t("fields.notes")} className="sm:col-span-2"><Textarea name="notes" /></Field>
        </CardContent>
      </Card>
      <div><Button type="submit" disabled={pending || !customer}>{t("common.save")}</Button></div>
    </form>
  );
}
