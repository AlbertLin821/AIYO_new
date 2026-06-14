"use client";

import { useState } from "react";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import { CitationGroup } from "@/components/chat/SourceTag";
import TravelPlanDayAccordion from "@/components/chat/TravelPlanDayAccordion";
import TravelPlanSourcePanel from "@/components/chat/TravelPlanSourcePanel";
import type { SourceReference } from "@/lib/types/sources";
import type { TravelPlanResponse } from "@/types";

const REVISION_ACTIONS = ["放慢步調", "改成自駕", "加入更多美食", "減少購物"] as const;

function cleanThemeLabel(value: string): string {
  return value.replace(/\s*(與周邊順遊|順遊)$/u, "").trim();
}

function RevisionActionBar({
  disabled,
  onRevise,
}: {
  disabled?: boolean;
  onRevise: (instruction: string) => void;
}) {
  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">快速修改</p>
      <div className="flex flex-wrap gap-2">
        {REVISION_ACTIONS.map((action) => (
          <button
            key={action}
            type="button"
            disabled={disabled}
            onClick={() => onRevise(action)}
            className="rounded-full border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:border-primary/50 hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
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
  onApply,
  revisionDisabled,
  onOpenGroundedSource,
}: {
  plan: TravelPlanResponse;
  onRevise: (instruction: string) => void;
  onApply?: () => void;
  revisionDisabled?: boolean;
  onOpenGroundedSource?: (source: SourceReference) => void;
}) {
  const [expandedDays, setExpandedDays] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(plan.days.map((day, index) => [day.day, index === 0])),
  );
  const [alertsOpen, setAlertsOpen] = useState(false);
  const sources = plan.sources;
  const allExpanded = plan.days.every((day) => expandedDays[day.day]);

  return (
    <div className="w-full space-y-5">
      <div className="overflow-hidden rounded-[28px] border border-slate-200/90 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.08)] ring-1 ring-black/5">
        <div className="border-b border-primary/20 bg-gradient-to-br from-primary via-primary-dark to-primary-dark/90 px-5 py-5 text-white">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/80">行程提案</p>
              <h3 className="text-xl font-semibold tracking-tight text-white">{plan.title}</h3>
              <p className="max-w-2xl text-sm leading-relaxed text-white/85">
                已整理成可直接調整與套用的每日安排。套用後會寫入右側即時行程。
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {onApply ? (
                <button
                  type="button"
                  disabled={revisionDisabled}
                  onClick={onApply}
                  className="inline-flex items-center gap-2 rounded-full border border-white/50 bg-white px-4 py-2 text-xs font-semibold text-primary shadow-sm transition-colors hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Check className="size-3.5" aria-hidden />
                  套用到行程
                </button>
              ) : null}
              <button
                type="button"
                onClick={() =>
                  setExpandedDays(Object.fromEntries(plan.days.map((day) => [day.day, !allExpanded])))
                }
                className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-white/10 px-4 py-2 text-xs font-medium text-white backdrop-blur-sm transition-colors hover:bg-white/20"
              >
                {allExpanded ? <ChevronUp className="size-3.5" aria-hidden /> : <ChevronDown className="size-3.5" aria-hidden />}
                {allExpanded ? "全部收合" : "全部展開"}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-5">
        {plan.days.map((day) => (
          <TravelPlanDayAccordion
            key={day.day}
            day={{ ...day, theme: cleanThemeLabel(day.theme) }}
            expanded={Boolean(expandedDays[day.day])}
            onToggle={() => setExpandedDays((prev) => ({ ...prev, [day.day]: !prev[day.day] }))}
          />
        ))}
      </div>

      {(plan.weather_alerts.length > 0 || plan.event_alerts.length > 0 || plan.assumptions.length > 0) && (
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <button
            type="button"
            onClick={() => setAlertsOpen((prev) => !prev)}
            className="flex w-full items-center justify-between gap-4 border-b border-slate-100 bg-white px-4 py-4 text-left"
          >
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">提醒</p>
              <p className="mt-1 text-sm text-slate-700">天氣、活動與假設條件提醒。</p>
            </div>
            <span className="inline-flex size-10 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-600">
              <ChevronDown className={`size-4 transition-transform ${alertsOpen ? "rotate-180" : ""}`} aria-hidden />
            </span>
          </button>
          {alertsOpen ? (
            <div className="space-y-3 bg-slate-50/80 px-4 py-4 text-sm leading-relaxed text-slate-700">
              {plan.weather_alerts.map((alert) => (
                <div key={`${alert.day}_${alert.message}`} className="rounded-2xl border border-slate-200/80 bg-white px-3 py-3">
                  <p className="font-medium text-slate-900">{`${alert.day}：${alert.message}`}</p>
                  <CitationGroup
                    citations={alert.citations}
                    sources={sources}
                    onOpenGroundedDetail={onOpenGroundedSource}
                  />
                </div>
              ))}
              {plan.event_alerts.map((alert, index) => (
                <div key={`${alert.day || "event"}_${index}`} className="rounded-2xl border border-slate-200/80 bg-white px-3 py-3">
                  <p className="font-medium text-slate-900">{alert.day ? `${alert.day}：${alert.message}` : alert.message}</p>
                  <CitationGroup
                    citations={alert.citations}
                    sources={sources}
                    onOpenGroundedDetail={onOpenGroundedSource}
                  />
                </div>
              ))}
              {plan.assumptions.map((item, index) => (
                <div key={`assumption_${index}_${item.text}`} className="rounded-2xl border border-slate-200/80 bg-white px-3 py-3">
                  <p className="font-medium text-slate-900">{item.text}</p>
                  <CitationGroup
                    citations={item.citations}
                    sources={sources}
                    onOpenGroundedDetail={onOpenGroundedSource}
                  />
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
