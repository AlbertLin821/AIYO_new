"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { CitationGroup } from "@/components/chat/SourceTag";
import TravelPlanDayAccordion from "@/components/chat/TravelPlanDayAccordion";
import TravelPlanSourcePanel from "@/components/chat/TravelPlanSourcePanel";
import type { TravelPlanResponse } from "@/types";

const REVISION_ACTIONS = ["放慢步調", "改成自駕", "加入更多美食", "減少購物"] as const;

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

function RevisionActionBar({
  disabled,
  onRevise,
}: {
  disabled?: boolean;
  onRevise: (instruction: string) => void;
}) {
  return (
    <div className="space-y-2 rounded-2xl border border-border-light bg-white/80 p-3 shadow-soft">
      <p className="text-xs font-semibold text-muted">快速修改</p>
      <div className="flex flex-wrap gap-2">
        {REVISION_ACTIONS.map((action) => (
          <button
            key={action}
            type="button"
            disabled={disabled}
            onClick={() => onRevise(action)}
            className="rounded-full border border-border-light bg-white px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-primary/30 hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {action}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function TravelPlanCard({
  plan,
  onRevise,
  revisionDisabled,
}: {
  plan: TravelPlanResponse;
  onRevise: (instruction: string) => void;
  revisionDisabled?: boolean;
}) {
  const [expandedDays, setExpandedDays] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(plan.days.map((day, index) => [day.day, index === 0])),
  );
  const [alertsOpen, setAlertsOpen] = useState(true);
  const sources = plan.sources;
  const overviewDays = plan.summary_table.map((row, index) => {
    const day = plan.days[index];
    const routeNames = uniqueByName(day?.spots || []).map((spot) => spot.name).slice(0, 4);
    return {
      day: row.day,
      routeNames,
      theme: day?.theme || row.main_route,
      citations: row.citations,
    };
  });
  const metrics = [
    `${plan.days.length} Days`,
    `${plan.days.reduce((sum, day) => sum + uniqueByName(day.spots).length, 0)} Spots`,
    `${Object.keys(sources || {}).length} Sources`,
  ];

  const allExpanded = plan.days.every((day) => expandedDays[day.day]);

  return (
    <div className="w-full space-y-5">
      <div className="overflow-hidden rounded-[32px] border-2 border-primary/20 bg-white shadow-[0_28px_90px_rgba(15,23,42,0.14)]">
        <div className="border-l-4 border-primary bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.14),_transparent_36%),linear-gradient(135deg,rgba(255,255,255,0.98),rgba(248,250,252,0.96))] px-5 py-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <span className="inline-flex rounded-full border border-primary/15 bg-primary/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-primary">
                Final Plan
              </span>
              <h3 className="text-xl font-semibold tracking-tight text-foreground">{plan.title}</h3>
              <p className="max-w-2xl text-sm leading-relaxed text-muted">
                已根據需求、景點資料、天氣與交通條件彙整成可直接採用的完整版本。
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                {metrics.map((metric) => (
                  <span
                    key={metric}
                    className="rounded-full border border-border-light bg-white px-3 py-1 text-xs font-medium text-slate-700"
                  >
                    {metric}
                  </span>
                ))}
              </div>
            </div>
            <button
              type="button"
              onClick={() =>
                setExpandedDays(Object.fromEntries(plan.days.map((day) => [day.day, !allExpanded])))
              }
              className="inline-flex items-center gap-2 rounded-full border border-border-light bg-white px-4 py-2 text-xs font-medium text-slate-700 transition-colors hover:border-primary/30 hover:bg-primary/5"
            >
              {allExpanded ? <ChevronUp className="size-3.5" aria-hidden /> : <ChevronDown className="size-3.5" aria-hidden />}
              {allExpanded ? "全部收合" : "全部展開"}
            </button>
          </div>

          <div className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {overviewDays.map((row) => (
              <div key={row.day} className="rounded-2xl border border-white/70 bg-white/75 px-3 py-3 shadow-[0_14px_35px_rgba(148,163,184,0.14)]">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary/80">{row.day}</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{row.theme}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {(row.routeNames.length ? row.routeNames : [row.theme]).slice(0, 4).map((name) => (
                    <span
                      key={`${row.day}_${name}`}
                      className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-700"
                    >
                      {name}
                    </span>
                  ))}
                </div>
                <CitationGroup citations={row.citations} sources={sources} />
              </div>
            ))}
          </div>
        </div>

        {plan.revision ? (
          <div className="border-t border-border-light bg-amber-50/70 px-5 py-4 text-xs text-slate-700">
            <div className="flex flex-wrap items-center gap-3">
              <p className="font-semibold text-foreground">本次調整摘要</p>
              <span className="rounded-full bg-white px-2.5 py-1 font-mono text-[11px] text-muted">
                {plan.revision.revised_from}
              </span>
              {plan.revision.changed_days.length > 0 ? (
                <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600">
                  {plan.revision.changed_days.join("、")}
                </span>
              ) : null}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {plan.revision.change_summary.map((item, index) => (
                <span
                  key={`${index}_${item}`}
                  className="rounded-full border border-amber-200 bg-white px-3 py-1 text-[11px] font-medium text-slate-700"
                >
                  {item}
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="space-y-4">
        {plan.days.map((day) => (
          <TravelPlanDayAccordion
            key={day.day}
            day={day}
            sources={sources}
            expanded={Boolean(expandedDays[day.day])}
            onToggle={() => setExpandedDays((prev) => ({ ...prev, [day.day]: !prev[day.day] }))}
          />
        ))}
      </div>

      {(plan.weather_alerts.length > 0 || plan.event_alerts.length > 0 || plan.assumptions.length > 0) && (
        <div className="overflow-hidden rounded-[24px] border border-border-light bg-white/88 shadow-soft">
          <button
            type="button"
            onClick={() => setAlertsOpen((prev) => !prev)}
            className="flex w-full items-center justify-between gap-4 px-4 py-4 text-left"
          >
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary/70">Alerts</p>
              <p className="mt-1 text-sm text-muted">天氣、活動與假設條件提醒。</p>
            </div>
            <span className="inline-flex size-10 items-center justify-center rounded-full border border-border-light bg-white text-slate-600">
              <ChevronDown className={`size-4 transition-transform ${alertsOpen ? "rotate-180" : ""}`} aria-hidden />
            </span>
          </button>
          {alertsOpen ? (
            <div className="space-y-3 border-t border-border-light px-4 py-4 text-sm leading-relaxed text-muted">
              {plan.weather_alerts.map((alert) => (
                <div key={`${alert.day}_${alert.message}`} className="rounded-2xl bg-slate-50/75 px-3 py-3">
                  <p>{`${alert.day}：${alert.message}`}</p>
                  <CitationGroup citations={alert.citations} sources={sources} />
                </div>
              ))}
              {plan.event_alerts.map((alert, index) => (
                <div key={`${alert.day || "event"}_${index}`} className="rounded-2xl bg-slate-50/75 px-3 py-3">
                  <p>{alert.day ? `${alert.day}：${alert.message}` : alert.message}</p>
                  <CitationGroup citations={alert.citations} sources={sources} />
                </div>
              ))}
              {plan.assumptions.map((item, index) => (
                <div key={`assumption_${index}_${item.text}`} className="rounded-2xl bg-slate-50/75 px-3 py-3">
                  <p>{item.text}</p>
                  <CitationGroup citations={item.citations} sources={sources} />
                </div>
              ))}
            </div>
          ) : null}
        </div>
      )}

      <TravelPlanSourcePanel sources={sources} />
      <RevisionActionBar disabled={revisionDisabled} onRevise={onRevise} />
    </div>
  );
}
