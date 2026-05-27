"use client";

import { Loader2 } from "lucide-react";
import QuestionCard from "@/components/chat/QuestionCard";
import {
  buildWorkflowSteps,
  formatStepHeading,
  getActiveWorkflowStep,
  getProcessingHint,
  getProgressBadge,
  getProgressPercent,
  getStepStatusLabel,
} from "@/lib/workflowSteps";
import { inferChatToolStatusFromSteps, formatChatToolStatusLabel } from "@/lib/chat/chatOrchestrator";
import { cn } from "@/lib/utils";
import { zhTW as t } from "@/locales/zh-TW";
import type { ChatQuestionAnswer, QuestionCardPayload, StatusStepPayload } from "@/types";

const DEFAULT_STEPS: StatusStepPayload[] = [
  { type: "status_step", phase: "understand", label: "了解旅遊需求", status: "running" },
  { type: "status_step", phase: "plan", label: "規劃查詢範圍", status: "pending" },
  { type: "status_step", phase: "research", label: "搜尋景點與交通", status: "pending" },
  { type: "status_step", phase: "compose", label: "整理完整行程", status: "pending" },
];

function stepCardClass(status: StatusStepPayload["status"]): string {
  const isActive = status === "running" || status === "waiting_input";
  if (isActive) {
    return "border-primary/35 bg-primary/10 text-slate-900";
  }
  if (status === "completed") {
    return "border-emerald-200 bg-emerald-50/70 text-slate-900";
  }
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function stepBadgeClass(status: StatusStepPayload["status"]): string {
  const isActive = status === "running" || status === "waiting_input";
  if (isActive) {
    return "bg-primary text-white";
  }
  if (status === "completed") {
    return "bg-emerald-600 text-white";
  }
  return "bg-slate-200 text-slate-600";
}

function stepStatusTextClass(status: StatusStepPayload["status"]): string {
  const isActive = status === "running" || status === "waiting_input";
  if (isActive) {
    return "text-primary";
  }
  if (status === "completed") {
    return "text-emerald-800";
  }
  return "text-slate-500";
}

function stepDescriptionClass(status: StatusStepPayload["status"]): string {
  const isActive = status === "running" || status === "waiting_input";
  if (isActive) {
    return "text-slate-700";
  }
  if (status === "completed") {
    return "text-slate-600";
  }
  return "text-slate-500";
}

export default function ChatWorkflowRail({
  visible,
  steps,
  questionCard,
  disabled,
  onSubmitQuestion,
}: {
  visible: boolean;
  steps: StatusStepPayload[];
  questionCard: QuestionCardPayload | null;
  disabled?: boolean;
  onSubmitQuestion: (answers: ChatQuestionAnswer[], displayMessage: string) => void;
}) {
  const resolvedSteps = steps.length ? steps : visible ? DEFAULT_STEPS : [];
  const workflowSteps = buildWorkflowSteps(resolvedSteps);
  const activeStep = getActiveWorkflowStep(workflowSteps);
  const progressBadge = getProgressBadge(workflowSteps);
  const progressPercent = getProgressPercent(workflowSteps);
  const processingHint = getProcessingHint(activeStep);
  const heading = activeStep
    ? formatStepHeading(activeStep, workflowSteps.length)
    : t.chat.workflowPlanningTitle;
  const isProcessing = progressBadge === "處理中" || progressBadge === "準備中";
  const toolStatus = inferChatToolStatusFromSteps(resolvedSteps);
  const toolStatusLabel = formatChatToolStatusLabel(toolStatus);
  const showToolStatus =
    toolStatus !== "idle" && toolStatus !== "done" && (isProcessing || progressBadge === "等你回覆");

  if (!visible || !workflowSteps.length) {
    return null;
  }

  return (
    <section className="isolate flex flex-col rounded-3xl border border-slate-200/90 border-l-4 border-l-primary bg-cream/40 shadow-[0_18px_50px_rgba(15,23,42,0.08)] ring-1 ring-black/5">
      <div className="overflow-hidden rounded-t-3xl border-b border-slate-200/80 bg-white/90 px-5 py-5 backdrop-blur-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-700">
              {t.chat.workflowPlanningTitle}
            </p>
            <h2 className="mt-2 text-lg font-semibold text-slate-900">{heading}</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-700">{processingHint}</p>
            {showToolStatus ? (
              <p className="mt-2 text-xs font-medium tracking-wide text-primary/95">
                工具狀態 · {toolStatusLabel}
              </p>
            ) : null}
          </div>
          <span
            className={cn(
              "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold",
              isProcessing
                ? "bg-primary/15 text-primary"
                : progressBadge === "完成"
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-slate-100 text-slate-700",
            )}
          >
            {isProcessing ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
            {progressBadge}
          </span>
        </div>

        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progressPercent)}
          aria-label="行程規劃進度"
          className="mt-4 h-2.5 overflow-hidden rounded-full bg-slate-200"
        >
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      <ol className="grid gap-3 p-5 lg:grid-cols-2" aria-label="規劃步驟列表">
        {workflowSteps.map((step) => (
          <li key={step.key} className={cn("rounded-2xl border px-3.5 py-3.5", stepCardClass(step.status))}>
            <div className="flex items-start gap-3">
              <span
                className={cn(
                  "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
                  stepBadgeClass(step.status),
                )}
              >
                {step.status === "running" ? (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden />
                ) : (
                  step.stepNumber
                )}
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-slate-900">{step.userTitle}</p>
                  <span className={cn("text-[11px] font-medium", stepStatusTextClass(step.status))}>
                    {getStepStatusLabel(step.status)}
                  </span>
                </div>
                <p className={cn("mt-1.5 text-xs leading-5", stepDescriptionClass(step.status))}>
                  {step.userDescription}
                </p>
              </div>
            </div>
          </li>
        ))}
      </ol>

      {questionCard ? (
        <div className="relative z-10 rounded-b-3xl border-t border-primary/15 bg-white/90 px-5 pb-5 pt-5 backdrop-blur-sm">
          <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
            <span
              className="inline-block size-2 shrink-0 rounded-full bg-primary/80 shadow-[0_0_8px_rgb(90_126_163/0.55)]"
              aria-hidden
            />
            補齊資料
          </p>
          <QuestionCard card={questionCard} disabled={disabled} onSubmit={onSubmitQuestion} />
        </div>
      ) : null}
    </section>
  );
}
