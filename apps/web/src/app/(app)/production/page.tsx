import Link from "next/link";
import { can, productionStages } from "@edge/core";
import { formatDate } from "@edge/i18n";
import { Forbidden } from "@/components/forbidden";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle, EmptyState, Num, PageHeader } from "@/components/ui/primitives";
import { getT } from "@/server/i18n";
import { requirePageContext } from "@/server/session";
import { OperationActions } from "../manufacturing/[id]/mo-client";
import { Button } from "@/components/ui/button";

/** Kanban-style board: one column per stage with the open operations. Tablet friendly. */
export default async function ProductionBoardPage() {
  const ctx = await requirePageContext();
  const { t, locale } = await getT();
  if (!can(ctx.actor, "production.view")) return <Forbidden t={t} />;
  const ops = await productionStages.productionBoard(ctx);
  const stages = new Map<string, { name: string; seq: number; ops: typeof ops }>();
  for (const op of ops) {
    const e = stages.get(op.stageId) ?? { name: locale === "ar" ? op.stage.nameAr : op.stage.nameEn, seq: op.stage.sequence, ops: [] };
    e.ops.push(op);
    stages.set(op.stageId, e);
  }
  const cols = [...stages.values()].sort((a, b) => a.seq - b.seq);
  const canEdit = can(ctx.actor, "production.update");
  const now = new Date();
  return (
    <>
      <PageHeader title={t("production.board")} actions={can(ctx.actor, "settings.edit") ? <Button asChild variant="outline"><Link href="/production-stages">{t("nav.productionStages")}</Link></Button> : null} />
      {cols.length === 0 ? <Card><EmptyState title={t("common.noResults")} /></Card> : (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {cols.map((c) => (
            <div key={c.name} className="w-80 shrink-0">
              <Card className="bg-muted/40">
                <CardHeader><CardTitle className="flex justify-between">{c.name}<Num className="text-muted-foreground">{c.ops.length}</Num></CardTitle></CardHeader>
                <CardContent className="grid gap-3">
                  {c.ops.map((op) => {
                    const mo = op.manufacturingOrder;
                    const late = mo.requiredDate && mo.requiredDate < now;
                    return (
                      <div key={op.id} className="grid gap-1.5 rounded-md border bg-card p-3 text-sm shadow-xs">
                        <div className="flex items-center justify-between gap-2">
                          <Link href={`/manufacturing/${mo.id}`} className="num font-semibold hover:underline">{mo.number}</Link>
                          <StatusBadge t={t} group="OperationStatus" value={op.status} />
                        </div>
                        <p dir="ltr" className="text-start">{mo.product.name}</p>
                        <p className="text-muted-foreground">{mo.customer.name}</p>
                        <p><Num>{Number(mo.width)} × {Number(mo.height)} · ×{Number(mo.quantity)}</Num></p>
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <StatusBadge t={t} group="Priority" value={mo.priority} />
                          {mo.requiredDate ? <Num className={late ? "font-semibold text-destructive" : "text-muted-foreground"}>{formatDate(locale, mo.requiredDate)}</Num> : null}
                          {op.employee ? <span className="text-muted-foreground">{op.employee.fullName}</span> : null}
                          {op.isDelayed ? <span className="text-destructive">{op.delayReason}</span> : null}
                        </div>
                        <OperationActions opId={op.id} status={op.status} canEdit={canEdit} />
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
