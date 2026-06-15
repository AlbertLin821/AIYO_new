"use client";

import { useCallback, useEffect, useRef } from "react";
import {
  CELL_SIZE,
  GAME_HEIGHT,
  GAME_WIDTH,
  useSnakeEngine,
} from "./useSnakeEngine";

type SnakeGameProps = {
  onPersistScore?: (score: number, highScore: number) => void;
};

const SWIPE_THRESHOLD = 24;

export default function SnakeGame({ onPersistScore }: SnakeGameProps) {
  const {
    snake,
    food,
    score,
    highScore,
    isGameOver,
    isStarted,
    setDirection,
    startGame,
    resetGame,
  } = useSnakeEngine();

  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const handleDirectionKey = useCallback(
    (event: KeyboardEvent) => {
      const keyMap: Record<string, "up" | "down" | "left" | "right"> = {
        ArrowUp: "up",
        ArrowDown: "down",
        ArrowLeft: "left",
        ArrowRight: "right",
        w: "up",
        W: "up",
        s: "down",
        S: "down",
        a: "left",
        A: "left",
        d: "right",
        D: "right",
      };
      const next = keyMap[event.key];
      if (!next) {
        return;
      }
      event.preventDefault();
      if (isGameOver) {
        resetGame();
        return;
      }
      if (!isStarted) {
        startGame();
      }
      setDirection(next);
    },
    [isGameOver, isStarted, resetGame, setDirection, startGame],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleDirectionKey);
    return () => window.removeEventListener("keydown", handleDirectionKey);
  }, [handleDirectionKey]);

  useEffect(() => {
    onPersistScore?.(score, highScore);
  }, [highScore, onPersistScore, score]);

  const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    const touch = event.changedTouches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    const start = touchStartRef.current;
    const touch = event.changedTouches[0];
    if (!start) {
      return;
    }
    touchStartRef.current = null;

    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (Math.abs(dx) < SWIPE_THRESHOLD && Math.abs(dy) < SWIPE_THRESHOLD) {
      if (!isStarted && !isGameOver) {
        startGame();
      }
      return;
    }

    event.preventDefault();
    if (isGameOver) {
      resetGame();
      return;
    }
    if (!isStarted) {
      startGame();
    }

    if (Math.abs(dx) > Math.abs(dy)) {
      setDirection(dx > 0 ? "right" : "left");
    } else {
      setDirection(dy > 0 ? "down" : "up");
    }
  };

  return (
    <div className="flex select-none justify-center">
      <div
        className="relative overflow-hidden rounded-2xl border-4 border-slate-800 shadow-[0_0_20px_rgba(0,0,0,0.35)]"
        style={{
          width: GAME_WIDTH,
          height: GAME_HEIGHT,
          maxWidth: "100%",
          backgroundColor: "#1a2e1a",
          touchAction: "none",
        }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)",
            backgroundSize: `${CELL_SIZE}px ${CELL_SIZE}px`,
          }}
        />

        {snake.map((segment, index) => (
          <div
            key={`${segment.x}-${segment.y}-${index}`}
            className="absolute rounded-sm"
            style={{
              left: segment.x * CELL_SIZE + 1,
              top: segment.y * CELL_SIZE + 1,
              width: CELL_SIZE - 2,
              height: CELL_SIZE - 2,
              backgroundColor: index === 0 ? "#4ade80" : "#22c55e",
              boxShadow: index === 0 ? "0 0 8px rgba(74,222,128,0.6)" : undefined,
            }}
          />
        ))}

        <div
          className="absolute rounded-full"
          style={{
            left: food.x * CELL_SIZE + 2,
            top: food.y * CELL_SIZE + 2,
            width: CELL_SIZE - 4,
            height: CELL_SIZE - 4,
            backgroundColor: "#ef4444",
            boxShadow: "0 0 10px rgba(239,68,68,0.7)",
          }}
        />

        <div className="pointer-events-none absolute left-0 top-5 z-20 w-full text-center text-white">
          <div className="text-3xl font-bold" style={{ textShadow: "4px 4px 0 #000" }}>
            {score}
          </div>
          <div className="text-sm opacity-90" style={{ textShadow: "2px 2px 0 #000" }}>
            最高分 {highScore}
          </div>
        </div>

        {!isStarted && !isGameOver ? (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/50 p-5 text-center text-white">
            <h2 className="text-3xl font-bold tracking-wide" style={{ textShadow: "4px 4px 0 #16a34a" }}>
              貪吃蛇
            </h2>
            <p className="mt-4 text-sm leading-6">按方向鍵、WASD 或滑動開始</p>
            <p className="mt-2 text-sm text-amber-200">上次最高分：{highScore}</p>
            <p className="mt-4 max-w-xs text-xs leading-5 text-white/90">
              按 ESC 可暫停並保存目前分數；旅遊規劃完成後，再按 ESC 即可關閉遊戲。
            </p>
          </div>
        ) : null}

        {isGameOver ? (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/55 p-5 text-center text-white">
            <h2 className="text-3xl font-bold" style={{ textShadow: "4px 4px 0 #c0392b" }}>
              撞到了！
            </h2>
            <p className="mt-3 text-lg">本次分數：{score}</p>
            <p className="mt-1 text-sm">最高分：{Math.max(highScore, score)}</p>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                resetGame();
              }}
              className="mt-6 rounded-xl border-4 border-emerald-700 bg-emerald-500 px-5 py-3 text-sm font-semibold text-white transition-transform hover:scale-105"
            >
              再玩一次
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
