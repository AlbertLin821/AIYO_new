"use client";

import { useEffect } from "react";
import Airplane from "./Airplane";
import Building from "./Building";
import { GAME_HEIGHT, GAME_WIDTH, useGameEngine } from "./useGameEngine";

type SkyDashGameProps = {
  onPersistScore?: (score: number, highScore: number) => void;
};

export default function SkyDashGame({ onPersistScore }: SkyDashGameProps) {
  const {
    airplaneY,
    buildings,
    score,
    highScore,
    isGameOver,
    isStarted,
    jump,
    resetGame,
  } = useGameEngine();

  useEffect(() => {
    const handleKeyPress = (event: KeyboardEvent) => {
      if (event.code === "Space") {
        if (isGameOver) {
          resetGame();
        } else {
          jump();
        }
        event.preventDefault();
      }
    };
    window.addEventListener("keydown", handleKeyPress);
    return () => window.removeEventListener("keydown", handleKeyPress);
  }, [jump, isGameOver, resetGame]);

  useEffect(() => {
    onPersistScore?.(score, highScore);
  }, [highScore, onPersistScore, score]);

  return (
    <div className="flex cursor-pointer select-none justify-center" onClick={jump}>
      <div
        className="relative overflow-hidden rounded-2xl border-4 border-slate-800 shadow-[0_0_20px_rgba(0,0,0,0.35)]"
        style={{
          width: GAME_WIDTH,
          height: GAME_HEIGHT,
          maxWidth: "100%",
          backgroundColor: "#87CEEB",
        }}
      >
        <div className="pointer-events-none absolute left-[10%] top-[10%] text-2xl opacity-30">☁️</div>
        <div className="pointer-events-none absolute left-[70%] top-[20%] text-3xl opacity-20">☁️</div>
        <div className="pointer-events-none absolute left-[40%] top-[50%] text-2xl opacity-25">☁️</div>

        <Airplane y={airplaneY} />

        {buildings.map((building) => (
          <Building key={building.id} x={building.x} topHeight={building.topHeight} />
        ))}

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
            <h2 className="text-3xl font-bold tracking-wide" style={{ textShadow: "4px 4px 0 #e74c3c" }}>
              SKY DASH
            </h2>
            <p className="mt-4 text-sm leading-6">按空白鍵或點擊畫面開始</p>
            <p className="mt-2 text-sm text-amber-200">上次最高分：{highScore}</p>
            <p className="mt-4 max-w-xs text-xs leading-5 text-white/90">
              按 ESC 可暫停並保存目前分數；旅遊規劃完成後，再按 ESC 即可關閉遊戲。
            </p>
          </div>
        ) : null}

        {isGameOver ? (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/55 p-5 text-center text-white">
            <h2 className="text-3xl font-bold" style={{ textShadow: "4px 4px 0 #c0392b" }}>
              墜機了！
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
