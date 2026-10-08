"use client";

import { useEffect, useRef, useState } from "react";
import { Search, X } from "@/components/ui/material-icons";
import { Input } from "@/components/ui/primitives";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";

export type PickItem = { id: string; label: string; sub?: string };

/** Debounced server-side search combobox (e.g. customers by name/phone/code). */
export function SearchPicker({ endpoint, map, value, onChange, placeholder, disabled }: {
  endpoint: string; // e.g. "/customers?status=ACTIVE"
  map: (row: Record<string, unknown>) => PickItem;
  value: PickItem | null;
  onChange: (v: PickItem | null) => void;
  placeholder: string;
  disabled?: boolean;
}) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<PickItem[]>([]);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef(map);
  mapRef.current = map;

  useEffect(() => {
    if (!open) return;
    const h = setTimeout(async () => {
      try {
        const sep = endpoint.includes("?") ? "&" : "?";
        const res = await api<{ items: Record<string, unknown>[] }>(`${endpoint}${sep}pageSize=15&q=${encodeURIComponent(q)}`);
        setItems(res.items.map((r) => mapRef.current(r)));
      } catch {
        setItems([]);
      }
    }, 250);
    return () => clearTimeout(h);
  }, [q, open, endpoint]);

  useEffect(() => {
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  if (value) {
    return (
      <div className="flex min-h-12 items-center gap-2 rounded-xl border border-input bg-background/60 px-4 py-2 text-sm shadow-sm shadow-foreground/5">
        <span className="min-w-0 flex-1 truncate font-medium">{value.label}</span>
        {value.sub ? <span className="num truncate text-xs text-muted-foreground">{value.sub}</span> : null}
        {!disabled ? <button type="button" onClick={() => onChange(null)} className="rounded-lg p-1 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring" aria-label="clear"><X className="size-4" /></button> : null}
      </div>
    );
  }
  return (
    <div ref={box} className="relative">
      <Search className="pointer-events-none absolute start-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => setOpen(true)} placeholder={placeholder} className="ps-11" disabled={disabled} />
      {open && items.length > 0 ? (
        <ul className="absolute z-20 mt-2 max-h-72 w-full overflow-y-auto rounded-xl border bg-card p-1.5 shadow-xl shadow-foreground/10">
          {items.map((it) => (
            <li key={it.id}>
              <button
                type="button"
                className={cn("flex min-h-11 w-full items-center gap-2 rounded-lg px-3 py-2 text-start text-sm hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring")}
                onClick={() => { onChange(it); setOpen(false); setQ(""); }}
              >
                <span className="min-w-0 flex-1 truncate">{it.label}</span>
                {it.sub ? <span className="num text-xs text-muted-foreground">{it.sub}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
