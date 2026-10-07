"use client";

import { useState } from "react";
import { DoorOpen } from "@/components/ui/material-icons";
import { cn } from "@/lib/utils";

export function ImageViewer({ images, name }: { images: string[]; name: string }) {
  const [active, setActive] = useState(images[0]);
  if (!active) {
    return (
      <div className="grid aspect-[3/4] place-items-center rounded-lg border bg-muted text-muted-foreground">
        <DoorOpen className="size-16 opacity-40" />
      </div>
    );
  }
  return (
    <div className="grid gap-3">
      <div className="overflow-hidden rounded-lg border bg-muted">
        <img src={`/api/v1/product-images/${active}`} alt={name} className="aspect-[3/4] w-full object-contain" />
      </div>
      {images.length > 1 ? (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {images.map((id) => (
            <button key={id} type="button" onClick={() => setActive(id)} className={cn("shrink-0 overflow-hidden rounded-md border-2", id === active ? "border-primary" : "border-transparent")}>
              <img src={`/api/v1/product-images/${id}`} alt="" loading="lazy" className="size-20 object-cover" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
