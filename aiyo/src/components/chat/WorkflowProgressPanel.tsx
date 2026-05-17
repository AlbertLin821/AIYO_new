"use client";

import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StatusStepPayload } from "@/types";
import ResearchActivityFeed from "@/components/chat/ResearchActivityFeed";

const PHASE_ORDER = ["understand", "plan", "waiting_user", "research", "compose"] as const;

const PHASE_META: Record<(typeof PHASE_ORDER)[number], { label: string; waitingLabel?: string }> = {
  understand: { label: "理解需求" },
  plan: { label: "規劃查詢" },
  waiting_user: { label: "等待補充條件", waitingLabel: "等待你補充條件" },
  research: { label: "查詢資料" },
  compose: { label: "生成行程" },
};

const STATUS_RANK: Record<StatusStepPayload["status"], number> = {
  failed: 5,
  running: 4,
  waiting_input: 3,
  pending: 2,
  completed: 1,
};

function pickDominantStatus(steps: StatusStepPayload[]): StatusStepPayload["status"] {
  return [...steps].sort((left, right) => STATUS_RANK[right.status] - STATUS_RANK[left.status])[0]?.status || "pending";
}

function buildWorkflowSteps(steps: StatusStepPayload[]) {
  const hasPhases = steps.some((step) => step.phase);
  if (!hasPhases) {
    return steps.map((step) => ({
      key: step.label,
      label: step.label,
      status: step.status,
      detail: step.detail,
    }));
  }

  return PHASE_ORDER
    .map((phase) => {
      const matches = steps.filter((step) => step.phase === phase);
      if (!matches.length) {
        return null;
      }
      const last = matches[matches.length - 1];
      const status = pickDominantStatus(matches);
      return {
        key: phase,
        label: status === "waiting_input" && PHASE_META[phase].waitingLabel ? PHASE_META[phase].waitingLabel : PHASE_META[phase].label,
        status,
        detail: last.detail || last.label,
      };
    })
    .filter(Boolean) as Array<{
    key: (typeof PHASE_ORDER)[number];
    label: string;
    status: StatusStepPayload["status"];
    detail?: string;
  }>;
}

function getProgressLabel(steps: ReturnType<typeof buildWorkflowSteps>): string {
  if (!steps.length) {
    return "Preparing";
  }
  if (steps.every((step) => step.status === "completed")) {
    return "Completed";
  }
  const waiting = steps.find((step) => step.status === "waiting_input");
  if (waiting) {
    return "Waiting for input";
  }
  const runningIndex = steps.findIndex((step) => step.status === "running");
  if (runningIndex >= 0) {
    return `Step ${runningIndex + 1} / ${steps.length}`;
  }
  const completedCount = steps.filter((step) => step.status === "completed").length;
  const activeIndex = Math.max(0, Math.min(completedCount, steps.length) - 1);
  return `Step ${activeIndex + 1} / ${steps.length}`;
}

function getProgressPercent(steps: ReturnType<typeof buildWorkflowSteps>): number {
  if (!steps.length) {
    return 0;
  }
  const completedCount = steps.filter((step) => step.status === "completed").length;
  const runningIndex = steps.findIndex((step) => step.status === "running");
  const waitingIndex = steps.findIndex((step) => step.status === "waiting_input");
  if (completedCount === steps.length) {
    return 100;
  }
  if (runningIndex >= 0) {
    return ((completedCount + 0.5) / steps.length) * 100;
  }
  if (waitingIndex >= 0) {
    return ((completedCount + 0.85) / steps.length) * 100;
  }
  return (completedCount / steps.length) * 100;
}

function getStepStatusLabel(status: StatusStepPayload["status"]): string {
  switch (status) {
    case "completed":
      return "完成";
    case "running":
      return "處理中";
    case "waiting_input":
      return "等待";
    case "failed":
      return "失敗";
    default:
      return "尚未開始";
  }
}

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
  const progressLabel = getProgressLabel(workflowSteps);
  const progressPercent = getProgressPercent(workflowSteps);

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
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary/70">Workflow</p>
            <p className="mt-1 text-sm text-muted">AI 會依序理解需求、查資料並整理成最終行程。</p>
          </div>
          <span className="rounded-full bg-primary/8 px-3 py-1 text-xs font-semibold text-primary">
            {progressLabel}
          </span>
        </div>
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progressPercent)}
          aria-label="行程規劃進度"
          className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200"
        >
          <motion.div
            className="h-full rounded-full bg-primary"
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
                  "mt-1 size-2 shrink-0 rounded-full",
                  step.status === "completed"
                    ? "bg-primary"
                    : step.status === "running"
                      ? "bg-primary animate-pulse"
                      : step.status === "waiting_input"
                        ? "bg-amber-400"
                        : step.status === "failed"
                          ? "bg-rose-500"
                          : "bg-slate-300",
                )}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className={cn("text-sm", step.status === "pending" ? "text-muted" : "font-medium text-foreground")}>
                    {step.label}
                  </p>
                  <span className="text-[11px] text-muted">{getStepStatusLabel(step.status)}</span>
                  {step.status === "running" ? <Loader2 className="size-3.5 animate-spin text-primary" aria-hidden /> : null}
                </div>
                {step.detail ? <p className="mt-1 text-xs leading-6 text-muted">{step.detail}</p> : null}
              </div>
            </li>
          ))}
        </ul>
      </motion.div>
      {showResearchFeed ? <ResearchActivityFeed steps={steps} /> : null}
    </div>
  );
}
