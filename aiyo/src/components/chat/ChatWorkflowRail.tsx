"use client";

import { Loader2 } from "lucide-react";
import {
  buildWorkflowSteps,
  formatStepHeading,
  getActiveWorkflowStep,
  getProgressBadge,
  type WorkflowStepView,
} from "@/lib/workflowSteps";
import { cn } from "@/lib/utils";
import { zhTW as t } from "@/locales/zh-TW";
import type { StatusStepPayload } from "@/types";

function stepDotClass(status: WorkflowStepView["status"]): string {
  if (status === "completed") {
    return "bg-emerald-600";
  }
  if (status === "running" || status === "waiting_input") {
    return "bg-primary ring-4 ring-primary/20";
  }
  if (status === "failed") {
    return "bg-red-500";
  }
  return "bg-slate-300";
}

function connectorClass(leftStatus: WorkflowStepView["status"]): string {
  return leftStatus === "completed" ? "bg-emerald-300" : "bg-slate-200";
}

export default function ChatWorkflowRail({
  visible,
  steps,
}: {
  visible: boolean;
  steps: StatusStepPayload[];
}) {
  const workflowSteps = buildWorkflowSteps(steps);
  const activeStep = getActiveWorkflowStep(workflowSteps);
  const progressBadge = getProgressBadge(workflowSteps);
  const heading = activeStep
    ? formatStepHeading(activeStep, workflowSteps.length)
    : t.chat.workflowPlanningTitle;
  const isProcessing = progressBadge === "處理中" || progressBadge === "準備中";

  if (!visible || !workflowSteps.length) {
    return null;
  }

  return (
    <section
      className="rounded-2xl border border-slate-200/90 border-l-4 border-l-primary bg-white/90 px-4 py-4 shadow-sm ring-1 ring-black/5"
      aria-label="行程規劃進度"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-600">
            {t.chat.workflowPlanningTitle}
          </p>
          <p className="mt-1.5 text-sm font-semibold text-slate-900">{heading}</p>
        </div>
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
            isProcessing
              ? "bg-primary/15 text-primary"
              : progressBadge === "已完成"
                ? "bg-emerald-100 text-emerald-800"
                : "bg-slate-100 text-slate-700",
          )}
        >
          {isProcessing ? <Loader2 className="size-3 animate-spin" aria-hidden /> : null}
          {progressBadge}
        </span>
      </div>

      <ol className="mt-4 flex items-center" aria-label="規劃步驟">
        {workflowSteps.map((step, index) => (
          <li key={step.key} className="flex flex-1 items-center last:flex-none">
            <span
              className={cn("size-2.5 shrink-0 rounded-full transition-colors", stepDotClass(step.status))}
              title={step.userTitle}
              aria-current={step.status === "running" || step.status === "waiting_input" ? "step" : undefined}
            />
            {index < workflowSteps.length - 1 ? (
              <span
                className={cn("mx-1 h-0.5 flex-1 rounded-full", connectorClass(step.status))}
                aria-hidden
              />
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
