"use client";

import { AnimatePresence, m } from "@/lib/motion";
import { Gamepad2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { useCallback, useEffect, useRef, useState } from "react";
import SkyDashGame from "@/components/chat/skyDash/SkyDashGame";
import {
  buildWorkflowSteps,
  getActiveWorkflowStep,
  type WorkflowStepView,
} from "@/lib/workflowSteps";
import { getSkyDashHighScore, saveSkyDashHighScore } from "@/lib/skyDashStorage";
import { cn } from "@/lib/utils";
import type { StatusStepPayload } from "@/types";

const WAIT_GAME_PHASES = new Set(["research", "compose"]);
const PROMPT_DELAY_MS = 5000;

type PlanningWaitGameProps = {
  steps?: StatusStepPayload[];
  isPlanning?: boolean;
  planningComplete?: boolean;
  isWaiting?: boolean;
  waitKey?: string | null;
  promptDelayMs?: number;
  promptTitle?: string;
  promptDescription?: string;
  gameTitle?: string;
  gameDescription?: string;
  completionTitle?: string;
  completionDescription?: string;
  suppressFloatingPrompt?: boolean;
  gameOpen?: boolean;
  onGameOpenChange?: (open: boolean) => void;
};

function isWaitGamePhase(step: WorkflowStepView | null): boolean {
  return Boolean(step && WAIT_GAME_PHASES.has(step.key) && step.status === "running");
}

export default function PlanningWaitGame({
  steps = [],
  isPlanning = false,
  planningComplete = false,
  isWaiting,
  waitKey,
  promptDelayMs = PROMPT_DELAY_MS,
  promptTitle = "等太久了嗎？玩一下小遊戲等待完成規劃吧！",
  promptDescription,
  gameTitle = "Sky Dash",
  gameDescription = "規劃進行中，先玩小遊戲打發時間。",
  completionTitle = "旅遊規劃完成囉！",
  completionDescription,
  suppressFloatingPrompt = false,
  gameOpen: controlledGameOpen,
  onGameOpenChange,
}: PlanningWaitGameProps) {
  const workflowSteps = buildWorkflowSteps(steps);
  const activeStep = getActiveWorkflowStep(workflowSteps);
  const shouldOfferGame = isPlanning && isWaitGamePhase(activeStep);
  const waitingActive = isWaiting ?? shouldOfferGame;
  const waitingDone = planningComplete;
  const activeWaitKey = waitKey ?? activeStep?.key ?? (waitingActive ? "default-wait" : null);

  const [promptVisible, setPromptVisible] = useState(false);
  const [internalGameOpen, setInternalGameOpen] = useState(false);
  const gameOpen = controlledGameOpen ?? internalGameOpen;
  const setGameOpen = useCallback(
    (nextOpen: boolean) => {
      if (onGameOpenChange) {
        onGameOpenChange(nextOpen);
      } else {
        setInternalGameOpen(nextOpen);
      }
    },
    [onGameOpenChange],
  );
  const [completionToastVisible, setCompletionToastVisible] = useState(false);
  const [escHint, setEscHint] = useState<string | null>(null);
  const [savedHighScore, setSavedHighScore] = useState(0);

  const phaseStartedAtRef = useRef<number | null>(null);
  const lastPhaseKeyRef = useRef<string | null>(null);
  const promptTimerRef = useRef<number | null>(null);
  const completionNotifiedRef = useRef(false);
  const hadWaitingSessionRef = useRef(false);
  const latestScoreRef = useRef(0);
  const escSavedOnceRef = useRef(false);

  const clearPromptTimer = useCallback(() => {
    if (promptTimerRef.current !== null) {
      window.clearTimeout(promptTimerRef.current);
      promptTimerRef.current = null;
    }
  }, []);

  const resetSession = useCallback(() => {
    clearPromptTimer();
    phaseStartedAtRef.current = null;
    lastPhaseKeyRef.current = null;
    setPromptVisible(false);
    setGameOpen(false);
    setCompletionToastVisible(false);
    setEscHint(null);
    completionNotifiedRef.current = false;
    hadWaitingSessionRef.current = false;
    escSavedOnceRef.current = false;
  }, [clearPromptTimer, setGameOpen]);

  useEffect(() => {
    if (waitingDone) {
      clearPromptTimer();
      queueMicrotask(() => setPromptVisible(false));
      return;
    }

    if (!waitingActive) {
      if (!gameOpen) {
        queueMicrotask(() => resetSession());
      } else {
        clearPromptTimer();
        queueMicrotask(() => setPromptVisible(false));
      }
      return;
    }

    hadWaitingSessionRef.current = true;
    const phaseKey = activeWaitKey || null;
    if (phaseKey !== lastPhaseKeyRef.current) {
      lastPhaseKeyRef.current = phaseKey;
      phaseStartedAtRef.current = Date.now();
      if (!gameOpen) {
        queueMicrotask(() => setPromptVisible(false));
      }
      clearPromptTimer();

      promptTimerRef.current = window.setTimeout(() => {
        if (!suppressFloatingPrompt) {
          setPromptVisible(true);
        }
      }, promptDelayMs);
    }
  }, [
    activeWaitKey,
    waitingActive,
    clearPromptTimer,
    resetSession,
    gameOpen,
    waitingDone,
    promptDelayMs,
    suppressFloatingPrompt,
  ]);

  useEffect(() => {
    if (!waitingDone || completionNotifiedRef.current || !hadWaitingSessionRef.current) {
      return;
    }
    completionNotifiedRef.current = true;
    queueMicrotask(() => setCompletionToastVisible(true));
    const timer = window.setTimeout(() => {
      setCompletionToastVisible(false);
    }, 6000);
    return () => window.clearTimeout(timer);
  }, [waitingDone]);

  useEffect(() => {
    if (!gameOpen) {
      return;
    }
    queueMicrotask(() => setSavedHighScore(getSkyDashHighScore()));

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      event.preventDefault();
      const saved = saveSkyDashHighScore(latestScoreRef.current);
      setSavedHighScore(saved);

      if (waitingDone || escSavedOnceRef.current) {
        setGameOpen(false);
        setPromptVisible(false);
        setEscHint(null);
        escSavedOnceRef.current = false;
        return;
      }

      escSavedOnceRef.current = true;
      setEscHint("分數已保存。再按 ESC 即可關閉遊戲。");
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [gameOpen, waitingDone]);

  useEffect(() => {
    if (waitingDone && escHint) {
      queueMicrotask(() => setEscHint("旅遊規劃已完成，現在可以按 ESC 關閉遊戲。"));
    }
  }, [waitingDone, escHint]);

  useEffect(() => {
    if (!waitingActive && !promptVisible && !gameOpen) {
      return;
    }
    queueMicrotask(() => setSavedHighScore(getSkyDashHighScore()));
  }, [gameOpen, promptVisible, waitingActive]);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== "aiyo-sky-dash-high-score") {
        return;
      }
      setSavedHighScore(getSkyDashHighScore());
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const handlePersistScore = useCallback((score: number, highScore: number) => {
    latestScoreRef.current = score;
    setSavedHighScore((current) => Math.max(current, highScore));
  }, []);

  const openGame = useCallback(() => {
    setSavedHighScore(getSkyDashHighScore());
    setPromptVisible(false);
    setGameOpen(true);
    setEscHint(null);
    escSavedOnceRef.current = false;
  }, [setGameOpen]);

  if (!waitingActive && !gameOpen && !completionToastVisible) {
    return null;
  }

  return (
    <>
      <AnimatePresence>
        {promptVisible && !gameOpen && !suppressFloatingPrompt ? (
          <m.div
            key="planning-wait-prompt"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            className="fixed bottom-24 left-1/2 z-[85] w-[min(92vw,420px)] -translate-x-1/2"
          >
            <div className="rounded-2xl border border-primary/20 bg-white px-4 py-4 shadow-[0_18px_50px_rgba(15,23,42,0.18)]">
              <p className="text-sm font-medium text-slate-900">{promptTitle}</p>
              <div className="mt-3 flex items-center justify-between gap-3">
                <p className="text-xs text-slate-500">{promptDescription || `上次最高分：${savedHighScore}`}</p>
                <button
                  type="button"
                  onClick={openGame}
                  className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-primary/90"
                >
                  <Gamepad2 className="size-3.5" aria-hidden />
                  開始玩 Sky Dash
                </button>
              </div>
            </div>
          </m.div>
        ) : null}
      </AnimatePresence>

      <Dialog
        open={gameOpen}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            if (!planningComplete) {
              return;
            }
            saveSkyDashHighScore(latestScoreRef.current);
            setGameOpen(false);
          }
        }}
      >
        <DialogContent
          showCloseButton={false}
          aria-label="Sky Dash 小遊戲"
          className="w-full max-w-md gap-0 overflow-hidden rounded-[28px] border border-slate-200 bg-white p-0 shadow-[0_28px_80px_rgba(15,23,42,0.25)] sm:max-w-md"
        >
          <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
            <div>
              <p className="text-sm font-semibold text-slate-900">{gameTitle}</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                {gameDescription}
                <br />
                按 ESC 保存分數{waitingDone ? "並關閉遊戲" : "，規劃完成後即可關閉"}。
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="關閉遊戲"
              onClick={() => {
                saveSkyDashHighScore(latestScoreRef.current);
                setGameOpen(false);
              }}
              className="rounded-full border border-slate-200"
            >
              <X className="size-4" aria-hidden />
            </Button>
          </div>

          <div className="px-4 py-4">
            {escHint ? (
              <p className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
                {escHint}
              </p>
            ) : null}
            <SkyDashGame
              onPersistScore={handlePersistScore}
            />
          </div>
        </DialogContent>
      </Dialog>

      <AnimatePresence>
        {completionToastVisible ? (
          <m.div
            key="planning-complete-toast"
            initial={{ opacity: 0, y: -12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            className="pointer-events-none fixed right-4 top-4 z-[100] w-full max-w-sm"
          >
            <div className="pointer-events-auto rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 shadow-soft-lg">
              <p className="text-sm font-semibold text-emerald-900">{completionTitle}</p>
              <p className="mt-1 text-xs text-emerald-800">
                {completionDescription || `行程已整理完成${gameOpen ? "，現在可以按 ESC 關閉小遊戲。" : "。"}`}
              </p>
            </div>
          </m.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
