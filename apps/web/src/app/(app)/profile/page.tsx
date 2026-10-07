import { ChangePasswordForm } from "@/components/change-password-form";
import { Card, CardContent, CardHeader, CardTitle, PageHeader } from "@/components/ui/primitives";
import { getT } from "@/server/i18n";
import { requirePageContext } from "@/server/session";
import { ProfileForm } from "./profile-form";

export default async function ProfilePage() {
  const { actor, db } = await requirePageContext();
  const { t } = await getT();
  const me = await db.user.findUniqueOrThrow({ where: { id: actor.userId }, select: { fullName: true, phone: true, locale: true, username: true, email: true } });
  return (
    <>
      <PageHeader title={t("profile.title")} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>{t("profile.title")}</CardTitle></CardHeader>
          <CardContent><ProfileForm initial={me} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>{t("auth.changePassword")}</CardTitle></CardHeader>
          <CardContent><ChangePasswordForm /></CardContent>
        </Card>
      </div>
    </>
  );
}
