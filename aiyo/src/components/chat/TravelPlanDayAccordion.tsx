"use client";

import { motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { CitationGroup } from "@/components/chat/SourceTag";
import { cn } from "@/lib/utils";
import type { TravelPlanResponse } from "@/types";

function normalizeDisplayText(value: string): string {
  return value.toLowerCase().replace(/臺/g, "台").replace(/\s+/g, "").trim();
}

function uniqueByName<T extends { name: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = normalizeDisplayText(item.name);
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export default function TravelPlanDayAccordion({
  day,
  sources,
  expanded,
  onToggle,
}: {
  day: TravelPlanResponse["days"][number];
  sources?: TravelPlanResponse["sources"];
  expanded: boolean;
  onToggle: () => void;
}) {
  const routeNames = uniqueByName(day.spots).map((spot) => spot.name);

  return (
    <section className="overflow-hidden rounded-[26px] border border-slate-200 bg-white shadow-[0_12px_34px_rgba(15,23,42,0.05)]">
      <div className="border-b border-slate-200 bg-white px-4 py-4">
        <div className="flex items-start justify-between gap-4">
          <button
            type="button"
            onClick={onToggle}
            className="min-w-0 flex-1 text-left"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-primary/15 px-3 py-1 text-xs font-semibold text-primary ring-1 ring-primary/25">
                {day.day}
              </span>
              <h4 className="text-lg font-semibold text-slate-900">{day.theme}</h4>
            </div>
            {routeNames.length > 0 ? (
              <p className="mt-2 text-sm text-slate-700">{routeNames.join(" → ")}</p>
            ) : null}
          </button>
          <button
            type="button"
            onClick={onToggle}
            aria-label={`${expanded ? "收合" : "展開"} ${day.day}`}
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-600 transition-colors hover:bg-slate-100"
          >
            <ChevronDown className={cn("size-4 transition-transform", expanded ? "rotate-180" : "")} aria-hidden />
          </button>
        </div>
        <div className="mt-3">
          <CitationGroup citations={day.citations} sources={sources} />
        </div>
      </div>

      {expanded ? (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          className="space-y-4 px-4 py-4"
        >
          <div className="flex flex-col gap-3">
            {day.transportation.length > 0 && (
              <div className="rounded-xl border border-slate-200/90 bg-slate-50/60 px-4 py-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">交通</p>
                <ul className="space-y-2 text-sm text-foreground">
                  {day.transportation.map((item, index) => (
                    <li key={`${day.day}_transport_${index}_${item.text}`} className="rounded-xl bg-white/80 px-3 py-2">
                      <p>{item.text}</p>
                      <CitationGroup citations={item.citations} sources={sources} />
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {uniqueByName(day.spots).map((spot, index) => (
                  <div
                    key={`${day.day}_spot_${index}_${spot.name}`}
                    className="rounded-xl border border-slate-200/90 bg-slate-50/60 px-4 py-3"
                  >
                    <p className="text-sm font-semibold text-slate-900">{spot.name}</p>
                    <p className="mt-2 text-sm leading-6 text-slate-700">{spot.feature}</p>
                    <CitationGroup citations={spot.citations} sources={sources} />
                  </div>
                ))}

            {uniqueByName(day.food_recommendations).length > 0 && (
              <div className="rounded-xl border border-slate-200/90 bg-slate-50/60 px-4 py-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">餐點安排</p>
                <div className="space-y-2">
                  {uniqueByName(day.food_recommendations).map((food, index) => (
                    <div key={`${day.day}_food_${index}_${food.name}`} className="rounded-xl bg-white/85 px-3 py-3">
                      <p className="text-sm font-semibold text-foreground">{food.name}</p>
                      <p className="mt-1 text-xs leading-6 text-muted">{food.description}</p>
                      <CitationGroup citations={food.citations} sources={sources} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {day.tips.length > 0 && (
              <div className="rounded-xl border border-slate-200/90 bg-slate-50/60 px-4 py-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">提醒與備註</p>
                <ul className="space-y-2">
                  {day.tips.map((tip, index) => (
                    <li key={`${day.day}_tip_${index}_${tip.text}`} className="rounded-xl bg-white/85 px-3 py-2 text-xs leading-6 text-muted">
                      <p>{tip.text}</p>
                      <CitationGroup citations={tip.citations} sources={sources} />
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </motion.div>
      ) : null}
    </section>
  );
}
