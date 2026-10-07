"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  BarChart3, Boxes, ClipboardCheck, ClipboardList, Coins, Contact, DoorOpen, Factory, FileText, Hammer, History, Landmark,
  LayoutDashboard, LayoutGrid, ListTree, LogOut, Menu, PackageMinus, PackagePlus, Receipt, Ruler, Settings, ShieldCheck,
  ShoppingCart, SlidersHorizontal, Store, Tags, Truck, UserRound, Users, Wallet, Warehouse, X, Calculator, PackageCheck,
} from "@/components/ui/material-icons";
import { useI18n } from "@/components/i18n-provider";
import { LanguageSwitch } from "@/components/language-switch";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import type { NavIcon, NavSection } from "./nav";
import { GlobalSearch, NotificationBell } from "./topbar-tools";

const ICONS: Record<NavIcon, typeof Users> = {
  dashboard: LayoutDashboard,
  users: Users,
  roles: ShieldCheck,
  settings: Settings,
  audit: History,
  customers: Contact,
  suppliers: Truck,
  showrooms: Store,
  gallery: LayoutGrid,
  products: DoorOpen,
  tags: Tags,
  options: SlidersHorizontal,
  materials: Boxes,
  units: Ruler,
  warehouses: Warehouse,
  quotations: FileText,
  orders: ClipboardList,
  invoices: Receipt,
  payments: Wallet,
  cash: Landmark,
  measurements: Ruler,
  bom: ListTree,
  manufacturing: Factory,
  production: Hammer,
  quality: ClipboardCheck,
  issues: PackageMinus,
  stock: PackageCheck,
  purchases: ShoppingCart,
  receipts: PackagePlus,
  deliveries: Truck,
  expenses: Coins,
  reports: BarChart3,
  costing: Calculator,
};

export function AppShell({ nav, user, children }: { nav: NavSection[]; user: { fullName: string; username: string }; children: ReactNode }) {
  const { t } = useI18n();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  async function signOut() {
    await api("/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`));
  const quickPaths = ["/", "/quotations", "/manufacturing", "/stock", "/reports"];
  const quickNav = quickPaths.map((href) => nav.flatMap((s) => s.items).find((i) => i.href === href)).filter((i) => i !== undefined);
  const currentSection = nav.find((s) => s.items.some((i) => isActive(i.href)))?.labelKey;

  const sidebar = (
    <nav className="flex h-full flex-col overflow-y-auto px-3 py-5" aria-label="main">
      <Link href="/" className="mb-4 flex items-center gap-3 border-b px-2 pb-5 text-base font-bold text-foreground">
        <span className="grid size-11 place-items-center rounded-[15px] bg-primary text-primary-foreground"><DoorOpen className="text-2xl" /></span>
        <span className="grid leading-tight"><span className="font-sans" dir="ltr">EDGE WOOD</span><small className="mt-1 text-[11px] font-normal text-muted-foreground">{t("app.name")}</small></span>
      </Link>
      {nav.map((section, i) => (
        <details key={`${i}-${currentSection}`} className="group mb-1" open={!section.labelKey || currentSection === section.labelKey}>
          {section.labelKey ? <summary className="flex cursor-pointer list-none items-center justify-between rounded-xl px-3 py-2 text-xs font-bold text-sidebar-muted hover:bg-muted [&::-webkit-details-marker]:hidden">{t(section.labelKey)}<span className="material-symbols-rounded text-base transition-transform group-open:rotate-180">expand_more</span></summary> : null}
          <div className="grid gap-0.5">{section.items.map((item) => {
            const Icon = ICONS[item.icon];
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2.5 rounded-2xl px-3 py-2.5 text-sm font-medium transition-colors hover:bg-muted",
                  active && "bg-sidebar-active font-bold text-primary",
                )}
              >
                <Icon className="size-5 opacity-80" />
                {t(item.labelKey)}
              </Link>
            );
          })}</div>
        </details>
      ))}
    </nav>
  );

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[256px_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-dvh border-l bg-sidebar text-sidebar-foreground lg:block">{sidebar}</aside>

      {open ? (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
          <button className="absolute inset-0 bg-black/40" aria-label={t("nav.closeMenu")} onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 start-0 w-72 max-w-[85%] bg-sidebar text-sidebar-foreground shadow-xl">
            <Button variant="ghost" size="icon" className="absolute end-2 top-3 text-sidebar-foreground hover:bg-sidebar-active" onClick={() => setOpen(false)} aria-label={t("nav.closeMenu")}>
              <X />
            </Button>
            {sidebar}
          </aside>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-[70px] items-center gap-2 border-b bg-card/90 px-4 backdrop-blur sm:px-8">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setOpen(true)} aria-label={t("nav.openMenu")}>
            <Menu />
          </Button>
          <div className="flex min-w-0 flex-1 justify-start"><GlobalSearch /></div>
          <NotificationBell />
          <LanguageSwitch signedIn />
          <Link href="/profile" className="flex items-center gap-2 rounded-2xl px-2 py-1.5 text-sm hover:bg-accent">
            <span className="grid size-9 place-items-center rounded-full bg-secondary text-secondary-foreground"><UserRound className="size-5" /></span>
            <span className="hidden max-w-40 truncate sm:inline">{user.fullName}</span>
          </Link>
          <Button variant="ghost" size="icon" onClick={signOut} aria-label={t("nav.logout")} title={t("nav.logout")}>
            <LogOut className="rtl:rotate-180" />
          </Button>
        </header>
        <main className="mx-auto w-full max-w-[1510px] flex-1 px-4 py-6 pb-24 sm:px-8 lg:pb-12">{children}</main>
      </div>
      <nav className="fixed inset-x-0 bottom-0 z-30 flex justify-around border-t bg-card px-2 py-1 lg:hidden" aria-label="quick navigation">
        {quickNav.map((item) => {
          const Icon = ICONS[item.icon];
          return <Link key={item.href} href={item.href} aria-current={isActive(item.href) ? "page" : undefined} className={cn("flex min-w-0 flex-col items-center gap-0.5 rounded-xl px-2 py-1 text-[10px] text-muted-foreground", isActive(item.href) && "bg-sidebar-active text-primary")}><Icon className="size-5" /><span className="truncate">{t(item.labelKey)}</span></Link>;
        })}
      </nav>
    </div>
  );
}
