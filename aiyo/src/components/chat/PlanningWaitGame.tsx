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
import SnakeGame from "@/components/chat/snake/SnakeGame";
import {
  buildWorkflowSteps,
  getActiveWorkflowStep,
  type WorkflowStepView,
} from "@/lib/workflowSteps";
import { getSkyDashHighScore, saveSkyDashHighScore } from "@/lib/skyDashStorage";
import { getSnakeHighScore, saveSnakeHighScore } from "@/lib/snakeStorage";
import type { StatusStepPayload } from "@/types";

const WAIT_GAME_PHASES = new Set(["research", "compose"]);
const PROMPT_DELAY_MS = 5000;

export type WaitGameId = "sky-dash" | "snake";

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

const GAME_META: Record<
  WaitGameId,
  { title: string; ariaLabel: string; buttonLabel: string; storageKey: string }
> = {
  "sky-dash": {
    title: "Sky Dash",
    ariaLabel: "Sky Dash 小遊戲",
    buttonLabel: "開始玩 Sky Dash",
    storageKey: "aiyo-sky-dash-high-score",
  },
  snake: {
    title: "貪吃蛇",
    ariaLabel: "貪吃蛇 小遊戲",
    buttonLabel: "開始玩貪吃蛇",
    storageKey: "aiyo-snake-high-score",
  },
};

function isWaitGamePhase(step: WorkflowStepView | null): boolean {
  return Boolean(step && WAIT_GAME_PHASES.has(step.key) && step.status === "running");
}

function getHighScore(gameId: WaitGameId): number {
  return gameId === "sky-dash" ? getSkyDashHighScore() : getSnakeHighScore();
}

function saveHighScore(gameId: WaitGameId, score: number): number {
  return gameId === "sky-dash" ? saveSkyDashHighScore(score) : saveSnakeHighScore(score);
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
  gameTitle,
  gameDescription = "",
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
  const [activeGame, setActiveGame] = useState<WaitGameId | null>(null);
  const gameOpen = controlledGameOpen ?? internalGameOpen;
  const setGameOpen = useCallback(
    (nextOpen: boolean) => {
      if (onGameOpenChange) {
        onGameOpenChange(nextOpen);
      } else {
        setInternalGameOpen(nextOpen);
      }
      if (!nextOpen) {
        setActiveGame(null);
      }
    },
    [onGameOpenChange],
  );
  const [completionToastVisible, setCompletionToastVisible] = useState(false);
  const [escHint, setEscHint] = useState<string | null>(null);
  const [skyDashHighScore, setSkyDashHighScore] = useState(0);
  const [snakeHighScore, setSnakeHighScore] = useState(0);

  const phaseStartedAtRef = useRef<number | null>(null);
  const lastPhaseKeyRef = useRef<string | null>(null);
  const promptTimerRef = useRef<number | null>(null);
  const completionNotifiedRef = useRef(false);
  const hadWaitingSessionRef = useRef(false);
  const latestScoreRef = useRef(0);
  const escSavedOnceRef = useRef(false);

  const refreshHighScores = useCallback(() => {
    setSkyDashHighScore(getSkyDashHighScore());
    setSnakeHighScore(getSnakeHighScore());
  }, []);

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
    setActiveGame(null);
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
    if (!gameOpen || !activeGame) {
      return;
    }
    queueMicrotask(() => refreshHighScores());

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      event.preventDefault();
      const saved = saveHighScore(activeGame, latestScoreRef.current);
      if (activeGame === "sky-dash") {
        setSkyDashHighScore(saved);
      } else {
        setSnakeHighScore(saved);
      }

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
  }, [activeGame, gameOpen, refreshHighScores, setGameOpen, waitingDone]);

  useEffect(() => {
    if (waitingDone && escHint) {
      queueMicrotask(() => setEscHint("旅遊規劃已完成，現在可以按 ESC 關閉遊戲。"));
    }
  }, [waitingDone, escHint]);

  useEffect(() => {
    if (!waitingActive && !promptVisible && !gameOpen) {
      return;
    }
    queueMicrotask(() => refreshHighScores());
  }, [gameOpen, promptVisible, refreshHighScores, waitingActive]);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (
        event.key !== GAME_META["sky-dash"].storageKey &&
        event.key !== GAME_META.snake.storageKey
      ) {
        return;
      }
      refreshHighScores();
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [refreshHighScores]);

  const handlePersistScore = useCallback(
    (score: number, highScore: number) => {
      latestScoreRef.current = score;
      if (activeGame === "sky-dash") {
        setSkyDashHighScore((current) => Math.max(current, highScore));
      } else if (activeGame === "snake") {
        setSnakeHighScore((current) => Math.max(current, highScore));
      }
    },
    [activeGame],
  );

  const openGame = useCallback(
    (gameId: WaitGameId) => {
      refreshHighScores();
      setActiveGame(gameId);
      setPromptVisible(false);
      setGameOpen(true);
      setEscHint(null);
      escSavedOnceRef.current = false;
    },
    [refreshHighScores, setGameOpen],
  );

  const closeGame = useCallback(() => {
    if (activeGame) {
      saveHighScore(activeGame, latestScoreRef.current);
    }
    setGameOpen(false);
  }, [activeGame, setGameOpen]);

  const activeGameMeta = activeGame ? GAME_META[activeGame] : null;
  const dialogTitle = gameTitle || activeGameMeta?.title || "小遊戲";
  const dialogAriaLabel = activeGameMeta?.ariaLabel || "小遊戲";

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
              <div className="mt-3 space-y-3">
                <p className="text-xs text-slate-500">
                  {promptDescription ||
                    `Sky Dash 最高分：${skyDashHighScore} · 貪吃蛇最高分：${snakeHighScore}`}
                </p>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => openGame("sky-dash")}
                    className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-primary/90"
                  >
                    <Gamepad2 className="size-3.5" aria-hidden />
                    {GAME_META["sky-dash"].buttonLabel}
                  </button>
                  <button
                    type="button"
                    onClick={() => openGame("snake")}
                    className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-2 text-xs font-semibold text-primary transition-colors hover:bg-primary/15"
                  >
                    <Gamepad2 className="size-3.5" aria-hidden />
                    {GAME_META.snake.buttonLabel}
                  </button>
                </div>
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
            if (activeGame) {
              saveHighScore(activeGame, latestScoreRef.current);
            }
            setGameOpen(false);
          }
        }}
      >
        <DialogContent
          showCloseButton={false}
          aria-label={dialogAriaLabel}
          className="w-full max-w-md gap-0 overflow-hidden rounded-[28px] border border-slate-200 bg-white p-0 shadow-[0_28px_80px_rgba(15,23,42,0.25)] sm:max-w-md"
        >
          <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
            <div>
              <p className="text-sm font-semibold text-slate-900">{dialogTitle}</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                {gameDescription ? (
                  <>
                    {gameDescription}
                    <br />
                  </>
                ) : null}
                按 ESC 保存分數{waitingDone ? "並關閉遊戲" : "，規劃完成後即可關閉"}。
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="關閉遊戲"
              onClick={closeGame}
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
            {activeGame === "sky-dash" ? (
              <SkyDashGame onPersistScore={handlePersistScore} />
            ) : activeGame === "snake" ? (
              <SnakeGame onPersistScore={handlePersistScore} />
            ) : null}
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
