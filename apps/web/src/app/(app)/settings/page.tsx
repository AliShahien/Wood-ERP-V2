import { can, settings } from "@edge/core";
import { Forbidden } from "@/components/forbidden";
import { PageHeader } from "@/components/ui/primitives";
import { getT } from "@/server/i18n";
import { requirePageContext } from "@/server/session";
import { SettingsForm } from "./settings-form";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t("settings.title") };
}

export default async function SettingsPage() {
  const ctx = await requirePageContext();
  const { t } = await getT();
  if (!can(ctx.actor, "settings.view")) return <Forbidden t={t} />;
  const values = await settings.getSettings(ctx);
  return (
    <>
      <PageHeader title={t("settings.title")} />
      <SettingsForm values={values} readOnly={!can(ctx.actor, "settings.edit")} />
    </>
  );
}
