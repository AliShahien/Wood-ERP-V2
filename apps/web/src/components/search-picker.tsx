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
      <div className="flex h-9 items-center gap-2 rounded-md border border-input bg-card px-3 text-sm">
        <span className="min-w-0 flex-1 truncate font-medium">{value.label}</span>
        {value.sub ? <span className="num truncate text-xs text-muted-foreground">{value.sub}</span> : null}
        {!disabled ? <button type="button" onClick={() => onChange(null)} className="text-muted-foreground hover:text-foreground" aria-label="clear"><X className="size-4" /></button> : null}
      </div>
    );
  }
  return (
    <div ref={box} className="relative">
      <Search className="pointer-events-none absolute start-2.5 top-2.5 size-4 text-muted-foreground" />
      <Input value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => setOpen(true)} placeholder={placeholder} className="ps-8" disabled={disabled} />
      {open && items.length > 0 ? (
        <ul className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-md border bg-card py-1 shadow-lg">
          {items.map((it) => (
            <li key={it.id}>
              <button
                type="button"
                className={cn("flex w-full items-center gap-2 px-3 py-2 text-start text-sm hover:bg-accent")}
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
