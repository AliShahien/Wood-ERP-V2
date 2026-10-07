import { getT } from "@/server/i18n";
import { requirePageContext } from "@/server/session";
import { ChangePasswordForm } from "@/components/change-password-form";

export default async function ChangePasswordPage() {
  const { session } = await requirePageContext({ allowPasswordChange: true });
  const { t } = await getT();
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <h1 className="mb-2 text-2xl font-semibold">{t("auth.changePassword")}</h1>
        {session.mustChangePassword ? <p className="mb-6 text-sm text-muted-foreground">{t("auth.mustChangePassword")}</p> : null}
        <ChangePasswordForm redirectTo="/" />
      </div>
    </main>
  );
}
