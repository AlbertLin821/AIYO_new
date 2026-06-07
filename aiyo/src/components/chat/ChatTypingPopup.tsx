"use client";

import { useEffect, useMemo, useState } from "react";
import { Gamepad2 } from "lucide-react";
import { m } from "@/lib/motion";
import WorkflowStepTimeline from "@/components/chat/WorkflowStepTimeline";
import WorkflowTravelerScene from "@/components/chat/WorkflowTravelerScene";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  buildWorkflowSteps,
  getActiveWorkflowStep,
  getProgressPercent,
  type WorkflowPhaseKey,
} from "@/lib/workflowSteps";
import { zhTW as t } from "@/locales/zh-TW";
import type { StatusStepPayload } from "@/types";

const WAIT_GAME_PHASES = new Set<WorkflowPhaseKey>(["research", "compose"]);
const DEFAULT_WAIT_GAME_DELAY_MS = 5000;

type ChatTypingPopupProps = {
  open: boolean;
  label: string;
  steps?: StatusStepPayload[];
  canOfferWaitGame?: boolean;
  waitGamePromptDelayMs?: number;
  onOpenWaitGame?: () => void;
};

export default function ChatTypingPopup({
  open,
  label,
  steps = [],
  canOfferWaitGame = false,
  waitGamePromptDelayMs = DEFAULT_WAIT_GAME_DELAY_MS,
  onOpenWaitGame,
}: ChatTypingPopupProps) {
  const [pulseProgress, setPulseProgress] = useState(24);
  const [waitGameOfferVisible, setWaitGameOfferVisible] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }
    let direction = 1;
    const intervalId = window.setInterval(() => {
      setPulseProgress((current) => {
        if (current >= 46) {
          direction = -1;
        } else if (current <= 20) {
          direction = 1;
        }
        return current + direction * 3;
      });
    }, 380);
    return () => window.clearInterval(intervalId);
  }, [open]);

  const workflowSteps = useMemo(() => buildWorkflowSteps(steps), [steps]);
  const activeStep = useMemo(() => getActiveWorkflowStep(workflowSteps), [workflowSteps]);
  const structuredProgress = workflowSteps.length ? getProgressPercent(workflowSteps) : null;
  const progressPercent = structuredProgress ?? pulseProgress;
  const phase = activeStep?.key;
  const travelerStatus =
    activeStep?.status === "waiting_input"
      ? "waiting_input"
      : activeStep?.status === "completed"
        ? "completed"
        : "running";

  const shouldOfferWaitGame =
    canOfferWaitGame &&
    Boolean(activeStep && WAIT_GAME_PHASES.has(activeStep.key as WorkflowPhaseKey) && activeStep.status === "running");

  useEffect(() => {
    if (!open || !shouldOfferWaitGame) {
      queueMicrotask(() => setWaitGameOfferVisible(false));
      return;
    }

    const timer = window.setTimeout(() => {
      setWaitGameOfferVisible(true);
    }, waitGamePromptDelayMs);

    return () => window.clearTimeout(timer);
  }, [open, shouldOfferWaitGame, waitGamePromptDelayMs, activeStep?.key]);

  useEffect(() => {
    if (!open) {
      queueMicrotask(() => setWaitGameOfferVisible(false));
    }
  }, [open]);

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          return;
        }
      }}
    >
      <DialogContent
        showCloseButton={false}
        data-testid="chat-typing-indicator"
        role="status"
        aria-live="polite"
        aria-busy={open}
        overlayProps={{ className: "bg-slate-900/25 backdrop-blur-[2px]" }}
        className="flex max-h-[min(88vh,720px)] w-full max-w-md flex-col gap-0 overflow-hidden rounded-[28px] border border-primary/10 bg-white p-0 shadow-[0_28px_80px_rgba(15,23,42,0.2)] sm:max-w-md"
      >
        <m.div
          initial={{ opacity: 0, scale: 0.96, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.24, ease: "easeOut" }}
          className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 pb-5 pt-4"
        >
          <p className="text-center text-xs font-semibold uppercase tracking-[0.14em] text-primary/80">
            {t.chat.typingPopupTitle}
          </p>
          <p className="mt-2 text-center text-sm font-medium leading-6 text-slate-800">{label}</p>
          {activeStep ? (
            <p className="mt-1 text-center text-xs leading-5 text-slate-500">{activeStep.userDescription}</p>
          ) : null}

          <WorkflowTravelerScene
            className="mt-4 shrink-0"
            progressPercent={progressPercent}
            phase={phase}
            status={travelerStatus}
          />

          {workflowSteps.length > 0 ? (
            <WorkflowStepTimeline steps={workflowSteps} className="mt-4" />
          ) : null}

          {waitGameOfferVisible && onOpenWaitGame ? (
            <div className="mt-4 rounded-2xl border border-primary/15 bg-primary/[0.04] px-4 py-3">
              <p className="text-sm font-medium text-slate-900">等太久了嗎？</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">可以邊等邊玩 Sky Dash 小遊戲。</p>
              <Button
                type="button"
                size="sm"
                className="mt-3 w-full rounded-full"
                onClick={onOpenWaitGame}
              >
                <Gamepad2 className="size-3.5" aria-hidden />
                開始玩 Sky Dash
              </Button>
            </div>
          ) : null}
        </m.div>
      </DialogContent>
    </Dialog>
  );
}
