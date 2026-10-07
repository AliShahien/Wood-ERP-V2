"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Bell, Search } from "@/components/ui/material-icons";
import { Input } from "@/components/ui/primitives";
import { useI18n } from "@/components/i18n-provider";
import { api } from "@/lib/api-client";

type Hit = { type: string; id: string; title: string; subtitle?: string; href: string };

/** Global search across customers, phones, documents, products, materials, suppliers. */
export function GlobalSearch() {
  const { t } = useI18n();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (q.trim().length < 2) return setHits([]);
    const h = setTimeout(() => api<{ items: Hit[] }>(`/search?q=${encodeURIComponent(q)}`).then((r) => setHits(r.items)).catch(() => setHits([])), 250);
    return () => clearTimeout(h);
  }, [q]);

  useEffect(() => {
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key === "k") { e.preventDefault(); box.current?.querySelector("input")?.focus(); } };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", key); };
  }, []);

  return (
    <div ref={box} className="relative w-full max-w-md">
      <Search className="pointer-events-none absolute start-2.5 top-2.5 size-4 text-muted-foreground" />
      <Input
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => { if (e.key === "Enter" && hits[0]) { router.push(hits[0].href); setOpen(false); } }}
        placeholder={t("search.placeholder")}
        className="ps-8"
        aria-label={t("common.search")}
      />
      {open && q.trim().length >= 2 ? (
        <div className="absolute z-40 mt-1 max-h-96 w-full overflow-y-auto rounded-md border bg-card py-1 shadow-lg">
          {hits.length === 0 ? <p className="px-3 py-2 text-sm text-muted-foreground">{t("search.noResults")}</p> : hits.map((h) => (
            <Link key={`${h.type}-${h.id}`} href={h.href} onClick={() => setOpen(false)} className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent">
              <span className="w-24 shrink-0 text-xs text-muted-foreground">{t(`search.types.${h.type}`)}</span>
              <span className="min-w-0 flex-1 truncate font-medium">{h.title}</span>
              {h.subtitle ? <span className="num truncate text-xs text-muted-foreground">{h.subtitle}</span> : null}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Bell with unread count (polled every 60 s). */
export function NotificationBell() {
  const { t } = useI18n();
  const [count, setCount] = useState(0);
  useEffect(() => {
    let alive = true;
    const load = () => api<number>("/notifications/count").then((c) => alive && setCount(Number(c))).catch(() => {});
    load();
    const h = setInterval(load, 60_000);
    return () => { alive = false; clearInterval(h); };
  }, []);
  return (
    <Link href="/notifications" className="relative grid size-9 place-items-center rounded-md hover:bg-accent" aria-label={t("nav.notifications")} title={t("nav.notifications")}>
      <Bell className="size-4" />
      {count > 0 ? <span className="num absolute -top-0.5 end-0 grid min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-white">{count > 99 ? "99+" : count}</span> : null}
    </Link>
  );
}
