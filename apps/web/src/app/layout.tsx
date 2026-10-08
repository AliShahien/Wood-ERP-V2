import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";
import { dirOf } from "@edge/i18n";
import { I18nProvider } from "@/components/i18n-provider";
import { getT } from "@/server/i18n";
import "./globals.css";


export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: { default: t("app.name"), template: `%s · ${t("app.name")}` }, description: t("app.tagline") };
}

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { locale, overrides } = await getT();
  const dir = dirOf(locale);
  return (
    <html lang={locale} dir={dir} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: "try{if(localStorage.getItem('edge-theme')==='dark')document.documentElement.dataset.theme='dark'}catch(e){}" }} />
      </head>
      <body className="min-h-dvh antialiased">
        <I18nProvider locale={locale} overrides={overrides}>
          {children}
        </I18nProvider>
        <Toaster position={dir === "rtl" ? "top-left" : "top-right"} richColors dir={dir} />
      </body>
    </html>
  );
}
