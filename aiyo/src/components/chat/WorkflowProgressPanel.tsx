"use client";

import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import ResearchActivityFeed from "@/components/chat/ResearchActivityFeed";
import {
  buildWorkflowSteps,
  getProgressBadge,
  getProgressLabel,
  getProgressPercent,
  getStepStatusLabel,
} from "@/lib/workflowSteps";
import { cn } from "@/lib/utils";
import { zhTW as t } from "@/locales/zh-TW";
import type { StatusStepPayload } from "@/types";

export default function WorkflowProgressPanel({
  steps,
  showResearchFeed = true,
}: {
  steps: StatusStepPayload[];
  showResearchFeed?: boolean;
}) {
  if (!steps.length) {
    return null;
  }

  const workflowSteps = buildWorkflowSteps(steps);
  const progressBadge = getProgressBadge(workflowSteps);
  const progressLabel = getProgressLabel(workflowSteps);
  const progressPercent = getProgressPercent(workflowSteps);
  const showSpinner = progressBadge === "處理中" || progressBadge === "準備中";

  return (
    <div className="space-y-3">
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.24 }}
        className="overflow-hidden rounded-[28px] border border-primary/10 bg-white/92 px-4 py-4 shadow-[0_24px_70px_rgba(15,23,42,0.08)] backdrop-blur"
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-foreground">{t.chat.workflowPlanningTitle}</p>
            <p className="mt-1 text-sm text-muted">{progressLabel}</p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/8 px-3 py-1 text-xs font-semibold text-primary">
            {showSpinner ? <Loader2 className="size-3 animate-spin" aria-hidden /> : null}
            {progressBadge}
          </span>
        </div>
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progressPercent)}
          aria-label="行程規劃進度"
          className="h-2 w-full overflow-hidden rounded-full bg-slate-200"
        >
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-primary/80 to-primary"
            initial={{ width: 0 }}
            animate={{ width: `${progressPercent}%` }}
            transition={{ duration: 0.4, ease: "easeOut" }}
          />
        </div>
        <ul className="mt-4 space-y-2.5">
          {workflowSteps.map((step) => (
            <li key={step.key} className="flex items-start gap-3 rounded-2xl bg-slate-50/75 px-3 py-3">
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
                {step.status === "running" ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  step.stepNumber
                )}
              </span>
              <WorkflowPanelStepContent step={step} />
            </li>
          ))}
        </ul>
      </motion.div>
      {showResearchFeed ? <ResearchActivityFeed steps={steps} /> : null}
    </div>
  );
}

function WorkflowPanelStepContent({ step }: { step: ReturnType<typeof buildWorkflowSteps>[number] }) {
  return (
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
      <p className="mt-1 text-xs leading-6 text-muted">{step.userDescription}</p>
    </div>
  );
}
