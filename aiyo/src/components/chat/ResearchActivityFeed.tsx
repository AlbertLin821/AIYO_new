"use client";

import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StatusStepPayload } from "@/types";

const PROVIDER_LABELS: Record<NonNullable<StatusStepPayload["provider"]>, string> = {
  google_places: "Google Places",
  open_meteo: "Open-Meteo",
  tavily: "Tavily",
  youtube: "YouTube",
  serper: "Serper",
  mock_web: "離線示範",
  ollama: "Ollama",
};

function getStatusLabel(step: StatusStepPayload): string {
  switch (step.status) {
    case "completed":
      return "已完成";
    case "running":
      return "進行中";
    case "waiting_input":
      return "等待回覆";
    case "failed":
      return "查詢失敗";
    default:
      return "尚未開始";
  }
}

export default function ResearchActivityFeed({
  steps,
}: {
  steps: StatusStepPayload[];
}) {
  const activities = steps.filter((step) => step.provider || step.query || step.detail);
  if (!activities.length) {
    return null;
  }

  return (
    <div className="rounded-[24px] border border-border-light bg-white/88 p-4 shadow-soft backdrop-blur">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary/70">Research Activity</p>
          <p className="mt-1 text-sm text-muted">目前正在查詢的來源與查詢內容。</p>
        </div>
      </div>
      <div className="mt-3 space-y-2.5">
        {activities.map((step, index) => (
          <div
            key={`${step.label}_${step.provider || "none"}_${step.query || "none"}_${index}`}
            className="rounded-2xl border border-slate-200 bg-slate-50/70 px-3 py-3"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  "inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold",
                  step.status === "completed"
                    ? "bg-emerald-100 text-emerald-700"
                    : step.status === "running"
                      ? "bg-primary/10 text-primary"
                      : step.status === "failed"
                        ? "bg-rose-100 text-rose-700"
                        : "bg-slate-200 text-slate-600",
                )}
              >
                {getStatusLabel(step)}
              </span>
              {step.provider ? (
                <span className="rounded-full border border-border-light bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700">
                  {PROVIDER_LABELS[step.provider]}
                </span>
              ) : null}
              <p className="text-sm font-medium text-foreground">{step.label}</p>
              {step.status === "running" ? <Loader2 className="size-3.5 animate-spin text-primary" aria-hidden /> : null}
            </div>
            {step.query ? <p className="mt-2 text-xs text-slate-600">查詢內容：{step.query}</p> : null}
            {step.detail ? <p className="mt-1 text-xs leading-6 text-muted">{step.detail}</p> : null}
          </div>
        ))}
      </div>
    </div>
  );
}
