"use client";

import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { getStepStatusLabel, type WorkflowStepView } from "@/lib/workflowSteps";

function StepNumberBadge({ step }: { step: WorkflowStepView }) {
  const isRunning = step.status === "running";

  return (
    <span
      className={cn(
        "flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
        step.status === "completed"
          ? "bg-primary text-white"
          : step.status === "running"
            ? "bg-primary text-white"
            : step.status === "waiting_input"
              ? "bg-amber-400 text-white"
              : step.status === "failed"
                ? "bg-rose-500 text-white"
                : "bg-slate-200 text-slate-500",
      )}
      aria-hidden
    >
      {isRunning ? <Loader2 className="size-3.5 animate-spin" /> : step.stepNumber}
    </span>
  );
}

type WorkflowStepTimelineProps = {
  steps: WorkflowStepView[];
  className?: string;
};

export default function WorkflowStepTimeline({ steps, className }: WorkflowStepTimelineProps) {
  if (!steps.length) {
    return null;
  }

  return (
    <ul className={cn("space-y-2", className)} aria-label="處理階段列表">
      {steps.map((step) => (
        <li
          key={step.key}
          className={cn(
            "flex items-start gap-3 rounded-xl px-3 py-2.5 transition-colors",
            step.status === "running" || step.status === "waiting_input"
              ? "bg-primary/[0.06] ring-1 ring-primary/15"
              : "bg-slate-50/80",
          )}
        >
          <StepNumberBadge step={step} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p
                className={cn(
                  "text-sm",
                  step.status === "pending" ? "text-muted" : "font-medium text-foreground",
                )}
              >
                步驟 {step.stepNumber}：{step.userTitle}
              </p>
              <span className="text-[11px] text-muted">{getStepStatusLabel(step.status)}</span>
            </div>
            <p className="mt-0.5 text-xs leading-5 text-muted">{step.userDescription}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
