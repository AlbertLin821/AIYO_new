"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Loader2, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import QuestionCard from "@/components/chat/QuestionCard";
import ResearchActivityFeed from "@/components/chat/ResearchActivityFeed";
import WorkflowTravelerScene from "@/components/chat/WorkflowTravelerScene";
import {
  buildWorkflowSteps,
  formatStepHeading,
  getActiveWorkflowStep,
  getProcessingHint,
  getProgressBadge,
  getProgressLabel,
  getProgressPercent,
  getStepStatusLabel,
  type WorkflowStepView,
} from "@/lib/workflowSteps";
import { cn } from "@/lib/utils";
import { zhTW as t } from "@/locales/zh-TW";
import type { ChatQuestionAnswer, QuestionCardPayload, StatusStepPayload } from "@/types";

type ChatWorkflowModalProps = {
  open: boolean;
  steps: StatusStepPayload[];
  questionCard: QuestionCardPayload | null;
  disabled?: boolean;
  allowDismiss?: boolean;
  onClose: () => void;
  onSubmitQuestion: (answers: ChatQuestionAnswer[], displayMessage: string) => void;
};

const DEFAULT_STEPS: StatusStepPayload[] = [
  { type: "status_step", phase: "understand", label: "了解旅遊需求", status: "running" },
  { type: "status_step", phase: "plan", label: "規劃查詢範圍", status: "pending" },
  { type: "status_step", phase: "research", label: "搜尋景點與交通", status: "pending" },
  { type: "status_step", phase: "compose", label: "整理完整行程", status: "pending" },
];

export default function ChatWorkflowModal({
  open,
  steps,
  questionCard,
  disabled,
  allowDismiss = false,
  onClose,
  onSubmitQuestion,
}: ChatWorkflowModalProps) {
  const resolvedSteps = steps.length ? steps : DEFAULT_STEPS;
  const workflowSteps = buildWorkflowSteps(resolvedSteps);
  const activeStep = getActiveWorkflowStep(workflowSteps);
  const progressBadge = getProgressBadge(workflowSteps);
  const progressLabel = getProgressLabel(workflowSteps);
  const progressPercent = getProgressPercent(workflowSteps);
  const processingHint = getProcessingHint(activeStep);
  const showQuestionForm = Boolean(questionCard);
  const questionStep =
    workflowSteps.find((step) => step.key === "waiting_user") ||
    workflowSteps.find((step) => step.status === "waiting_input") ||
    activeStep;
  const contentKey = showQuestionForm ? "question" : activeStep?.key || "progress";
  const headerStep = showQuestionForm ? questionStep : activeStep;
  const headerHeading = headerStep
    ? formatStepHeading(headerStep, workflowSteps.length)
    : t.chat.workflowPlanningTitle;
  const showResearchFeed =
    !showQuestionForm &&
    (activeStep?.key === "research" ||
      activeStep?.key === "compose" ||
      resolvedSteps.some((step) => step.phase === "research" && step.status === "running"));

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && allowDismiss) {
          onClose();
        }
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[min(90vh,860px)] w-full max-w-xl flex-col gap-0 overflow-hidden rounded-[28px] border border-primary/10 bg-white p-0 shadow-[0_28px_80px_rgba(15,23,42,0.18)] sm:max-w-xl"
      >
        <motion.div
          key={contentKey}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          <WorkflowModalHeader
            progressBadge={progressBadge}
            progressLabel={progressLabel}
            progressPercent={progressPercent}
            headerHeading={headerHeading}
            processingHint={processingHint}
            workflowSteps={workflowSteps}
            allowDismiss={allowDismiss}
            onClose={onClose}
          />
          <WorkflowModalBody
            contentKey={contentKey}
            showQuestionForm={showQuestionForm}
            questionCard={questionCard}
            disabled={disabled}
            onSubmitQuestion={onSubmitQuestion}
            activeStep={activeStep}
            questionStep={questionStep}
            showResearchFeed={showResearchFeed}
            resolvedSteps={resolvedSteps}
            progressPercent={progressPercent}
          />
        </motion.div>
      </DialogContent>
    </Dialog>
  );
}

function WorkflowModalBody({
  contentKey,
  showQuestionForm,
  questionCard,
  disabled,
  onSubmitQuestion,
  activeStep,
  questionStep,
  showResearchFeed,
  resolvedSteps,
  progressPercent,
}: {
  contentKey: string;
  showQuestionForm: boolean;
  questionCard: QuestionCardPayload | null;
  disabled?: boolean;
  onSubmitQuestion: (answers: ChatQuestionAnswer[], displayMessage: string) => void;
  activeStep: WorkflowStepView | null;
  questionStep: WorkflowStepView | null;
  showResearchFeed: boolean;
  resolvedSteps: StatusStepPayload[];
  progressPercent: number;
}) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 sm:px-6 sm:pb-6">
      <AnimatePresence mode="wait">
        {showQuestionForm && questionCard ? (
          <motion.div
            key="question-form"
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.2 }}
            className="space-y-4"
          >
            <WorkflowActiveStep activeStep={questionStep || activeStep} progressPercent={progressPercent} />
            <QuestionCard card={questionCard} disabled={disabled} onSubmit={onSubmitQuestion} />
          </motion.div>
        ) : (
          <motion.div
            key={contentKey}
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.2 }}
            className="space-y-4"
          >
            <WorkflowActiveStep activeStep={activeStep} progressPercent={progressPercent} />
            {showResearchFeed ? <ResearchActivityFeed steps={resolvedSteps} /> : null}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function WorkflowModalHeader({
  progressBadge,
  progressLabel,
  progressPercent,
  headerHeading,
  processingHint,
  workflowSteps,
  allowDismiss,
  onClose,
}: {
  progressBadge: string;
  progressLabel: string;
  progressPercent: number;
  headerHeading: string;
  processingHint: string;
  workflowSteps: WorkflowStepView[];
  allowDismiss: boolean;
  onClose: () => void;
}) {
  return (
    <div className="shrink-0 border-b border-primary/8 px-5 pb-4 pt-5 sm:px-6">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-semibold text-foreground">{t.chat.workflowPlanningTitle}</p>
        <ModalHeaderActions allowDismiss={allowDismiss} onClose={onClose} progressBadge={progressBadge} />
      </div>
      <p id="chat-workflow-modal-title" className="mt-2 text-base font-semibold leading-snug text-foreground">
        {headerHeading}
      </p>
      <p className="mt-1 text-sm text-muted">{progressLabel}</p>
      <WorkflowProgressBar progressPercent={progressPercent} />
      <p className="mt-2 text-xs text-muted">{processingHint}</p>
      <WorkflowStepTimeline steps={workflowSteps} className="mt-4" />
    </div>
  );
}

function WorkflowProgressBar({ progressPercent }: { progressPercent: number }) {
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progressPercent)}
      aria-label="行程規劃進度"
      className="mt-4 h-2 w-full overflow-hidden rounded-full bg-slate-200"
    >
      <motion.div
        className="h-full rounded-full bg-gradient-to-r from-primary/80 to-primary"
        initial={{ width: 0 }}
        animate={{ width: `${progressPercent}%` }}
        transition={{ duration: 0.4, ease: "easeOut" }}
      />
    </div>
  );
}

function ModalHeaderActions({
  allowDismiss,
  onClose,
  progressBadge,
}: {
  allowDismiss: boolean;
  onClose: () => void;
  progressBadge: string;
}) {
  const showSpinner = progressBadge === "處理中" || progressBadge === "準備中";

  return (
    <div className="flex items-center gap-2">
      <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/8 px-3 py-1 text-xs font-semibold text-primary">
        {showSpinner ? <Loader2 className="size-3 animate-spin" aria-hidden /> : null}
        {progressBadge}
      </span>
      {allowDismiss ? (
        <button
          type="button"
          onClick={onClose}
          className="rounded-full border border-border-light p-1.5 text-slate-500 transition-colors hover:bg-slate-50 hover:text-foreground"
          aria-label="關閉"
        >
          <X className="size-4" aria-hidden />
        </button>
      ) : null}
    </div>
  );
}

function WorkflowStepTimeline({ steps, className }: { steps: WorkflowStepView[]; className?: string }) {
  if (!steps.length) {
    return null;
  }

  return (
    <ul className={cn("space-y-2", className)} aria-label="規劃步驟列表">
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

function WorkflowActiveStep({
  activeStep,
  progressPercent,
}: {
  activeStep: WorkflowStepView | null;
  progressPercent: number;
}) {
  if (!activeStep) {
    return null;
  }

  const isProcessing = activeStep.status === "running";
  const showTraveler =
    isProcessing || activeStep.status === "waiting_input" || activeStep.status === "completed";

  return (
    <div className="rounded-2xl border border-primary/10 bg-primary/[0.04] px-4 py-4">
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white",
            activeStep.status === "completed"
              ? "bg-primary"
              : activeStep.status === "running"
                ? "bg-primary"
                : activeStep.status === "waiting_input"
                  ? "bg-amber-400"
                  : activeStep.status === "failed"
                    ? "bg-rose-500"
                    : "bg-slate-300 text-slate-600",
          )}
          aria-hidden
        >
          {isProcessing ? <Loader2 className="size-4 animate-spin" /> : activeStep.stepNumber}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-primary">目前進行</p>
          <h2 className="mt-0.5 text-base font-semibold text-foreground">{activeStep.userTitle}</h2>
          <p className="mt-2 text-sm leading-6 text-muted">{activeStep.userDescription}</p>
          {isProcessing ? <p className="mt-3 text-xs text-primary">系統正在處理，請稍候…</p> : null}
        </div>
      </div>
      {showTraveler ? (
        <WorkflowTravelerScene
          className="mt-4"
          progressPercent={
            activeStep.status === "completed"
              ? 100
              : Math.max(progressPercent, activeStep.status === "waiting_input" ? 28 : 12)
          }
          phase={activeStep.key}
          status={activeStep.status}
        />
      ) : null}
    </div>
  );
}
