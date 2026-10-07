import Link from "next/link";
import { notFound } from "next/navigation";
import { can, customers, lookups, plain, receivables } from "@edge/core";
import { LedgerStatement } from "@/components/ledger-statement";
import { formatNumber } from "@edge/i18n";
import { ActionButton } from "@/components/action-button";
import { AttachmentsPanel } from "@/components/attachments-panel";
import { EntityForm } from "@/components/entity-form";
import { Forbidden } from "@/components/forbidden";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle, Num, PageHeader } from "@/components/ui/primitives";
import { getT } from "@/server/i18n";
import { requirePageContext } from "@/server/session";
import { Button } from "@/components/ui/button";
import { customerFields } from "../fields";
import { CustomerRelated } from "./related";
import { SubRecords } from "./sub-records";

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePageContext();
  const { t, locale } = await getT();
  if (!can(ctx.actor, "customers.view")) return <Forbidden t={t} />;
  const { id } = await params;
  const c = await customers.getCustomer(ctx, id).catch(() => null);
  if (!c) notFound();
  const canEdit = can(ctx.actor, "customers.edit");
  const pickShowroom = ctx.actor.isSuperAdmin || ctx.actor.dataScope === "ALL";
  const showrooms = pickShowroom && canEdit ? await lookups.showroomOptions(ctx) : [];
  const counts = c.counts ?? { quotations: 0, salesOrders: 0, mos: 0, invoices: 0, payments: 0, deliveries: 0 };

  return (
    <>
      <PageHeader
        title={c.name}
        description={<span className="flex items-center gap-2"><Num>{c.code}</Num><StatusBadge t={t} group="RecordStatus" value={c.status} />{c.showroom ? <span>· {c.showroom.name}</span> : null}</span>}
        actions={<>
          {can(ctx.actor, "quotations.create") ? <Button asChild><Link href={`/quotations/new?customerId=${c.id}`}>{t("quotations.new")}</Link></Button> : null}
          {can(ctx.actor, "measurements.create") ? <Button asChild variant="outline"><Link href={`/measurements/new?customerId=${c.id}`}>{t("measurements.new")}</Link></Button> : null}
          {can(ctx.actor, "customers.delete") ? <ActionButton endpoint={`/customers/${c.id}`} method="DELETE" label="common.delete" variant="destructive" redirectTo="/customers" /> : null}
        </>}
      />
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {c.balance !== null ? (
          <Card className="col-span-2 sm:col-span-1 lg:col-span-1">
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">{t("customers.outstanding")}</p>
              <p className={`num mt-1 text-lg font-semibold ${c.balance > 0 ? "text-destructive" : ""}`}>{formatNumber(locale, c.balance)}</p>
            </CardContent>
          </Card>
        ) : null}
        {([
          ["customers.quotations", counts.quotations], ["customers.salesOrders", counts.salesOrders], ["customers.manufacturingOrders", counts.mos],
          ["customers.invoices", counts.invoices], ["customers.payments", counts.payments], ["customers.deliveries", counts.deliveries],
        ] as const).map(([k, n]) => (
          <Card key={k}>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">{t(k)}</p>
              <p className="num mt-1 text-lg font-semibold">{n}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4">
        <EntityForm
          fields={customerFields(showrooms, pickShowroom)}
          endpoint={`/customers/${c.id}`}
          method="PATCH"
          isEdit
          readOnly={!canEdit}
          initial={plain(c) as unknown as Record<string, unknown>}
        />
        <CustomerRelated customerId={c.id} />
        {can(ctx.actor, "payments.view") ? <LedgerStatement t={t} locale={locale} title={t("reports.statement")} rows={await receivables.customerStatement(ctx, c.id)} /> : null}
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>{t("customers.addresses")}</CardTitle></CardHeader>
            <CardContent>
              <SubRecords
                kind="addresses"
                customerId={c.id}
                canEdit={canEdit}
                rows={c.addresses.map((a) => ({ id: a.id, primary: a.address, secondary: [a.label, a.city, a.governorate].filter(Boolean).join(" · ") }))}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>{t("customers.contacts")}</CardTitle></CardHeader>
            <CardContent>
              <SubRecords
                kind="contacts"
                customerId={c.id}
                canEdit={canEdit}
                rows={c.contacts.map((x) => ({ id: x.id, primary: x.name, secondary: [x.role, x.phone, x.email].filter(Boolean).join(" · ") }))}
              />
            </CardContent>
          </Card>
        </div>
        <AttachmentsPanel entityType="customer" entityId={c.id} canUpload={can(ctx.actor, "attachments.upload")} canDelete={can(ctx.actor, "attachments.delete")} />
      </div>
    </>
  );
}
