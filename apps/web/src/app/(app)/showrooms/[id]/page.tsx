import { notFound } from "next/navigation";
import { can, lookups, plain, showrooms } from "@edge/core";
import { ActionButton } from "@/components/action-button";
import { EntityForm } from "@/components/entity-form";
import { Forbidden } from "@/components/forbidden";
import { PageHeader } from "@/components/ui/primitives";
import { getT } from "@/server/i18n";
import { requirePageContext } from "@/server/session";
import { showroomFields } from "../fields";

export default async function ShowroomPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePageContext();
  const { t } = await getT();
  if (!can(ctx.actor, "showrooms.view")) return <Forbidden t={t} />;
  const { id } = await params;
  const s = await showrooms.getShowroom(ctx, id).catch(() => null);
  if (!s) notFound();
  const canEdit = can(ctx.actor, "showrooms.edit");
  const managers = canEdit ? await lookups.userOptions(ctx) : s.manager ? [s.manager] : [];
  return (
    <>
      <PageHeader title={s.name} actions={can(ctx.actor, "showrooms.delete") ? <ActionButton endpoint={`/showrooms/${s.id}`} method="DELETE" label="common.delete" variant="destructive" redirectTo="/showrooms" /> : null} />
      <EntityForm fields={showroomFields(managers)} endpoint={`/showrooms/${s.id}`} method="PATCH" isEdit readOnly={!canEdit} initial={plain(s) as unknown as Record<string, unknown>} />
    </>
  );
}
