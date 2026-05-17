"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TravelPlanResponse } from "@/types";

export default function TravelPlanSourcePanel({
  sources,
}: {
  sources: TravelPlanResponse["sources"];
}) {
  const sourceEntries = Object.values(sources || {});
  const [open, setOpen] = useState(false);

  if (!sourceEntries.length) {
    return null;
  }

  return (
    <div className="overflow-hidden rounded-[24px] border border-border-light bg-white/88 shadow-soft">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between gap-4 px-4 py-4 text-left"
      >
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary/70">Sources</p>
          <p className="mt-1 text-sm text-muted">本次規劃引用的景點、天氣、官方與網頁來源。</p>
        </div>
        <span className="inline-flex size-10 items-center justify-center rounded-full border border-border-light bg-white text-slate-600">
          <ChevronDown className={cn("size-4 transition-transform", open ? "rotate-180" : "")} aria-hidden />
        </span>
      </button>
      {open ? (
        <div className="grid gap-2 border-t border-border-light px-4 py-4 sm:grid-cols-2">
          {sourceEntries.map((source) => (
            <a
              key={source.source_id}
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-2xl border border-border-light bg-white px-3 py-3 transition-colors hover:border-primary/30 hover:bg-primary/5"
            >
              <p className="text-sm font-medium text-foreground">{source.title}</p>
              <p className="mt-1 text-xs text-muted">{source.domain || source.provider}</p>
              <p className="mt-2 line-clamp-3 text-xs leading-6 text-muted">{source.preview_text || source.snippet}</p>
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}
