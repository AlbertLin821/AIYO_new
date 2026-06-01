"use client";

import { cn } from "@/lib/utils";
import type { TravelAdPreview } from "@/data/travelAdPreviews";

type TravelAdCardProps = {
  ad: TravelAdPreview;
  className?: string;
};

export default function TravelAdCard({ ad, className }: TravelAdCardProps) {
  return (
    <button
      type="button"
      data-testid={`travel-ad-${ad.id}`}
      aria-label={`${ad.brand}：${ad.title}`}
      className={cn(
        "relative flex h-[160px] w-[320px] shrink-0 flex-col justify-between overflow-hidden rounded-2xl border border-border-light p-5 text-left shadow-soft transition-transform hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        className,
      )}
      style={{ background: ad.bg }}
    >
      <div>
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          <span className="rounded-md bg-white/90 px-2 py-0.5 text-[10px] font-bold text-foreground shadow-sm">
            {ad.brand}
          </span>
          {ad.partner ? (
            <span className="rounded-md bg-white/70 px-2 py-0.5 text-[10px] font-medium text-muted">
              {ad.partner}
            </span>
          ) : null}
        </div>
        <p className="text-lg font-extrabold leading-tight" style={{ color: ad.titleColor }}>
          {ad.title}
        </p>
        <p className="mt-1 text-xs font-medium" style={{ color: ad.descColor }}>
          {ad.description}
        </p>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span
          className="rounded-full px-3 py-1 text-[11px] font-bold"
          style={{ backgroundColor: ad.btnBg, color: ad.btnColor }}
        >
          {ad.cta}
        </span>
        <span className="shrink-0 text-[9px] font-medium text-white/50">AD</span>
      </div>
    </button>
  );
}
