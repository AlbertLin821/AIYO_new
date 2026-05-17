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
    <section className="overflow-hidden rounded-[26px] border border-border-light bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(249,250,251,0.94))] shadow-[0_16px_44px_rgba(148,163,184,0.16)]">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start justify-between gap-4 border-b border-border-light bg-slate-50/80 px-4 py-4 text-left"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-white">{day.day}</span>
            <h4 className="text-base font-semibold text-foreground">{day.theme}</h4>
          </div>
          <p className="mt-2 text-sm text-muted">
            路線：{(routeNames.length ? routeNames : [day.theme]).slice(0, 4).join(" → ")}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {(routeNames.length ? routeNames : [day.theme]).slice(0, 4).map((name) => (
              <span
                key={`${day.day}_${name}`}
                className="rounded-full border border-primary/10 bg-white px-3 py-1 text-xs font-medium text-slate-700"
              >
                {name}
              </span>
            ))}
          </div>
          <CitationGroup citations={day.citations} sources={sources} />
        </div>
        <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-border-light bg-white text-slate-600">
          <ChevronDown className={cn("size-4 transition-transform", expanded ? "rotate-180" : "")} aria-hidden />
        </span>
      </button>

      {expanded ? (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          className="grid gap-4 px-4 py-4 lg:grid-cols-[1.5fr_1fr]"
        >
          <div className="space-y-4">
            {day.transportation.length > 0 && (
              <div className="rounded-2xl border border-sky-100 bg-sky-50/70 p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">交通策略</p>
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

            {uniqueByName(day.spots).length > 0 && (
              <div className="grid gap-3 sm:grid-cols-2">
                {uniqueByName(day.spots).map((spot, index) => (
                  <div
                    key={`${day.day}_spot_${index}_${spot.name}`}
                    className="rounded-2xl border border-white/80 bg-white p-4 shadow-[0_12px_30px_rgba(148,163,184,0.14)]"
                  >
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary/70">Spot {index + 1}</p>
                    <p className="mt-2 text-sm font-semibold text-foreground">{spot.name}</p>
                    <p className="mt-2 text-xs leading-6 text-muted">{spot.feature}</p>
                    <CitationGroup citations={spot.citations} sources={sources} />
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-4">
            {uniqueByName(day.food_recommendations).length > 0 && (
              <div className="rounded-2xl border border-amber-100 bg-amber-50/70 p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">餐食安排</p>
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
              <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-700">提醒與備註</p>
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
