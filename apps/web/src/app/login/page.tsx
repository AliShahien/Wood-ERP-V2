import { redirect } from "next/navigation";
import { getSession } from "@/server/session";
import { getT } from "@/server/i18n";
import { LoginForm } from "./login-form";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t("auth.signIn") };
}

export default async function LoginPage() {
  if (await getSession()) redirect("/");
  const { t } = await getT();
  return (
    <main className="grid min-h-dvh lg:grid-cols-[1fr_minmax(0,560px)]">
      <section className="relative hidden overflow-hidden bg-sidebar text-sidebar-foreground lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="flex items-center gap-3">
          <DoorMark />
          <span className="text-lg font-semibold">{t("app.name")}</span>
        </div>
        <div className="max-w-md">
          <p className="text-3xl font-semibold leading-snug">{t("app.tagline")}</p>
        </div>
        {/* Wood-grain lines, purely decorative */}
        <svg aria-hidden className="pointer-events-none absolute -end-24 top-1/4 h-[140%] w-[70%] opacity-[0.07]" viewBox="0 0 200 400" preserveAspectRatio="none">
          {Array.from({ length: 14 }, (_, i) => (
            <path key={i} d={`M${i * 15} 0 C ${i * 15 + 30} 120, ${i * 15 - 25} 260, ${i * 15 + 10} 400`} stroke="currentColor" strokeWidth="2" fill="none" />
          ))}
        </svg>
      </section>
      <section className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <DoorMark />
            <span className="text-lg font-semibold">{t("app.name")}</span>
          </div>
          <h1 className="mb-6 text-2xl font-semibold tracking-tight">{t("auth.signInTitle")}</h1>
          <LoginForm />
        </div>
      </section>
    </main>
  );
}

function DoorMark() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" aria-hidden>
      <rect x="7" y="3" width="18" height="26" rx="2" fill="var(--color-primary)" />
      <rect x="10" y="6" width="12" height="9" rx="1" fill="none" stroke="var(--color-primary-foreground)" strokeOpacity=".5" />
      <rect x="10" y="17" width="12" height="9" rx="1" fill="none" stroke="var(--color-primary-foreground)" strokeOpacity=".5" />
      <circle cx="21" cy="16" r="1.3" fill="var(--color-primary-foreground)" />
    </svg>
  );
}
