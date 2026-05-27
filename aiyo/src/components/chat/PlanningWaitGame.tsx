"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Gamepad2, X } from "lucide-react";
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
  steps: StatusStepPayload[];
  isPlanning: boolean;
  planningComplete: boolean;
};

function isWaitGamePhase(step: WorkflowStepView | null): boolean {
  return Boolean(step && WAIT_GAME_PHASES.has(step.key) && step.status === "running");
}

export default function PlanningWaitGame({
  steps,
  isPlanning,
  planningComplete,
}: PlanningWaitGameProps) {
  const workflowSteps = buildWorkflowSteps(steps);
  const activeStep = getActiveWorkflowStep(workflowSteps);
  const shouldOfferGame = isPlanning && isWaitGamePhase(activeStep);

  const [promptVisible, setPromptVisible] = useState(false);
  const [gameOpen, setGameOpen] = useState(false);
  const [completionToastVisible, setCompletionToastVisible] = useState(false);
  const [escHint, setEscHint] = useState<string | null>(null);
  const [savedHighScore, setSavedHighScore] = useState(0);

  const phaseStartedAtRef = useRef<number | null>(null);
  const lastPhaseKeyRef = useRef<string | null>(null);
  const promptTimerRef = useRef<number | null>(null);
  const completionNotifiedRef = useRef(false);
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
    escSavedOnceRef.current = false;
  }, [clearPromptTimer]);

  useEffect(() => {
    if (planningComplete) {
      clearPromptTimer();
      queueMicrotask(() => setPromptVisible(false));
      return;
    }

    if (!shouldOfferGame) {
      if (!gameOpen) {
        queueMicrotask(() => resetSession());
      } else {
        clearPromptTimer();
        queueMicrotask(() => setPromptVisible(false));
      }
      return;
    }

    const phaseKey = activeStep?.key || null;
    if (phaseKey !== lastPhaseKeyRef.current) {
      lastPhaseKeyRef.current = phaseKey;
      phaseStartedAtRef.current = Date.now();
      if (!gameOpen) {
        queueMicrotask(() => setPromptVisible(false));
      }
      clearPromptTimer();

      promptTimerRef.current = window.setTimeout(() => {
        setPromptVisible(true);
      }, PROMPT_DELAY_MS);
    }
  }, [activeStep?.key, shouldOfferGame, clearPromptTimer, resetSession, gameOpen, planningComplete]);

  useEffect(() => {
    if (!planningComplete || completionNotifiedRef.current) {
      return;
    }
    completionNotifiedRef.current = true;
    queueMicrotask(() => setCompletionToastVisible(true));
    const timer = window.setTimeout(() => {
      setCompletionToastVisible(false);
    }, 6000);
    return () => window.clearTimeout(timer);
  }, [planningComplete]);

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

      if (planningComplete || escSavedOnceRef.current) {
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
  }, [gameOpen, planningComplete]);

  useEffect(() => {
    if (planningComplete && escHint) {
      queueMicrotask(() => setEscHint("旅遊規劃已完成，現在可以按 ESC 關閉遊戲。"));
    }
  }, [planningComplete, escHint]);

  const openGame = () => {
    setSavedHighScore(getSkyDashHighScore());
    setPromptVisible(false);
    setGameOpen(true);
    setEscHint(null);
    escSavedOnceRef.current = false;
  };

  if (!shouldOfferGame && !gameOpen && !completionToastVisible) {
    return null;
  }

  return (
    <>
      <AnimatePresence>
        {promptVisible && !gameOpen ? (
          <motion.div
            key="planning-wait-prompt"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            className="fixed bottom-24 left-1/2 z-[85] w-[min(92vw,420px)] -translate-x-1/2"
          >
            <div className="rounded-2xl border border-primary/20 bg-white px-4 py-4 shadow-[0_18px_50px_rgba(15,23,42,0.18)]">
              <p className="text-sm font-medium text-slate-900">等太久了嗎？玩一下小遊戲等待完成規劃吧！</p>
              <div className="mt-3 flex items-center justify-between gap-3">
                <p className="text-xs text-slate-500">上次最高分：{savedHighScore}</p>
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
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {gameOpen ? (
          <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
            <motion.button
              type="button"
              aria-label="關閉遊戲背景"
              className="absolute inset-0 bg-slate-900/55 backdrop-blur-[2px]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                if (!planningComplete) {
                  return;
                }
                saveSkyDashHighScore(latestScoreRef.current);
                setGameOpen(false);
              }}
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="Sky Dash 小遊戲"
              initial={{ opacity: 0, scale: 0.96, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: 8 }}
              className="relative z-10 w-full max-w-md overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_28px_80px_rgba(15,23,42,0.25)]"
            >
              <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Sky Dash</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    規劃進行中，先玩小遊戲打發時間。
                    <br />
                    按 ESC 保存分數{planningComplete ? "並關閉遊戲" : "，規劃完成後即可關閉"}。
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="關閉遊戲"
                  disabled={!planningComplete}
                  onClick={() => {
                    saveSkyDashHighScore(latestScoreRef.current);
                    setGameOpen(false);
                  }}
                  className={cn(
                    "rounded-full border p-1.5 transition-colors",
                    planningComplete
                      ? "border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                      : "cursor-not-allowed border-slate-100 text-slate-300",
                  )}
                >
                  <X className="size-4" aria-hidden />
                </button>
              </div>

              <div className="px-4 py-4">
                {escHint ? (
                  <p className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
                    {escHint}
                  </p>
                ) : null}
                <SkyDashGame
                  onPersistScore={(score, highScore) => {
                    latestScoreRef.current = score;
                    setSavedHighScore(highScore);
                  }}
                />
              </div>
            </motion.div>
          </div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {completionToastVisible ? (
          <motion.div
            key="planning-complete-toast"
            initial={{ opacity: 0, y: -12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            className="pointer-events-none fixed right-4 top-4 z-[100] w-full max-w-sm"
          >
            <div className="pointer-events-auto rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 shadow-soft-lg">
              <p className="text-sm font-semibold text-emerald-900">旅遊規劃完成囉！</p>
              <p className="mt-1 text-xs text-emerald-800">
                行程已整理完成{gameOpen ? "，現在可以按 ESC 關閉小遊戲。" : "。"}
              </p>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
