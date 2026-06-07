"use client";

import { MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TripPlanItem } from "@/types";
import { activityTypeColors, activityTypeLabel } from "./itineraryUi";

export const ITINERARY_DRAG_DROP_ANIMATION = {
  duration: 180,
  easing: "cubic-bezier(0.18, 0.67, 0.6, 1.22)",
} as const;

type Props = {
  item: TripPlanItem;
};

export default function ActivityDragPreview({ item }: Props) {
  const colorClass = activityTypeColors[item.type];

  return (
    <div
      className={cn(
        "w-[min(420px,calc(100vw-2rem))] cursor-grabbing rounded-xl border border-primary/35 bg-surface shadow-xl ring-2 ring-primary/25",
        "border-l-4",
        colorClass,
      )}
    >
      <div className="flex items-start gap-3 px-4 py-3">
        <div className="flex min-w-[56px] flex-col items-center gap-1">
          <span className="rounded-md bg-primary/8 px-2 py-1 text-xs font-semibold font-mono text-primary">
            {item.time}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-semibold text-foreground">{item.title}</p>
            <span className="rounded-full bg-border-light px-2 py-0.5 text-[10px] text-muted">
              {activityTypeLabel(item.type)}
            </span>
          </div>
          {item.location?.name ? (
            <p className="mt-1 flex items-center gap-1 truncate text-xs text-primary/70">
              <MapPin className="size-3 shrink-0" />
              {item.location.name}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
