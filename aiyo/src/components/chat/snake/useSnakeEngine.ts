import { useCallback, useEffect, useRef, useState } from "react";
import { getSnakeHighScore, saveSnakeHighScore } from "@/lib/snakeStorage";

export const GAME_WIDTH = 400;
export const GAME_HEIGHT = 600;
export const CELL_SIZE = 20;
export const GRID_COLS = GAME_WIDTH / CELL_SIZE;
export const GRID_ROWS = GAME_HEIGHT / CELL_SIZE;

type Direction = "up" | "down" | "left" | "right";
type Point = { x: number; y: number };

type SimulationState = {
  snake: Point[];
  food: Point;
  score: number;
  direction: Direction;
  pendingDirection: Direction;
};

const INITIAL_SNAKE: Point[] = [
  { x: 10, y: 15 },
  { x: 9, y: 15 },
  { x: 8, y: 15 },
];

const OPPOSITE: Record<Direction, Direction> = {
  up: "down",
  down: "up",
  left: "right",
  right: "left",
};

function getBaseTickMs(score: number): number {
  return Math.max(50, 90 - Math.floor(score / 3) * 5);
}

function spawnFood(snake: Point[]): Point {
  const occupied = new Set(snake.map((segment) => `${segment.x},${segment.y}`));
  const freeCells: Point[] = [];
  for (let y = 0; y < GRID_ROWS; y += 1) {
    for (let x = 0; x < GRID_COLS; x += 1) {
      const key = `${x},${y}`;
      if (!occupied.has(key)) {
        freeCells.push({ x, y });
      }
    }
  }
  if (freeCells.length === 0) {
    return { x: 0, y: 0 };
  }
  return freeCells[Math.floor(Math.random() * freeCells.length)];
}

function createInitialSimulation(): SimulationState {
  const snake = [...INITIAL_SNAKE];
  return {
    snake,
    food: spawnFood(snake),
    score: 0,
    direction: "right",
    pendingDirection: "right",
  };
}

function stepSimulation(state: SimulationState): { next: SimulationState; gameOver: boolean } {
  const direction = state.pendingDirection;
  const head = state.snake[0];
  const nextHead: Point = {
    x: head.x + (direction === "left" ? -1 : direction === "right" ? 1 : 0),
    y: head.y + (direction === "up" ? -1 : direction === "down" ? 1 : 0),
  };

  if (
    nextHead.x < 0 ||
    nextHead.x >= GRID_COLS ||
    nextHead.y < 0 ||
    nextHead.y >= GRID_ROWS
  ) {
    return { next: state, gameOver: true };
  }

  const ateFood = nextHead.x === state.food.x && nextHead.y === state.food.y;
  const bodyToCheck = ateFood ? state.snake : state.snake.slice(0, -1);
  if (bodyToCheck.some((segment) => segment.x === nextHead.x && segment.y === nextHead.y)) {
    return { next: state, gameOver: true };
  }

  const nextSnake = [nextHead, ...state.snake];
  if (!ateFood) {
    nextSnake.pop();
  }

  if (ateFood) {
    return {
      next: {
        ...state,
        snake: nextSnake,
        food: spawnFood(nextSnake),
        score: state.score + 1,
        direction,
        pendingDirection: direction,
      },
      gameOver: false,
    };
  }

  return {
    next: {
      ...state,
      snake: nextSnake,
      direction,
      pendingDirection: direction,
    },
    gameOver: false,
  };
}

export function useSnakeEngine() {
  const simRef = useRef<SimulationState>(createInitialSimulation());
  const [snake, setSnake] = useState<Point[]>(INITIAL_SNAKE);
  const [food, setFood] = useState<Point>(() => simRef.current.food);
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(() => getSnakeHighScore());
  const [isGameOver, setIsGameOver] = useState(false);
  const [isStarted, setIsStarted] = useState(false);

  const syncFromSim = useCallback((state: SimulationState) => {
    setSnake(state.snake);
    setFood(state.food);
    setScore(state.score);
  }, []);

  const setDirection = useCallback((next: Direction) => {
    const facing = simRef.current.pendingDirection;
    if (next === OPPOSITE[facing]) {
      return;
    }
    simRef.current = { ...simRef.current, pendingDirection: next };
  }, []);

  const resetGame = useCallback(() => {
    simRef.current = createInitialSimulation();
    syncFromSim(simRef.current);
    setIsGameOver(false);
    setIsStarted(false);
  }, [syncFromSim]);

  const startGame = useCallback(() => {
    if (isGameOver) {
      resetGame();
      return;
    }
    setIsStarted(true);
  }, [isGameOver, resetGame]);

  const persistScore = useCallback(() => {
    const next = saveSnakeHighScore(simRef.current.score);
    setHighScore(next);
    return next;
  }, []);

  useEffect(() => {
    if (!isStarted || isGameOver) {
      return;
    }

    let rafId = 0;
    let lastTime: number | null = null;
    let elapsed = 0;

    const tick = (time: number) => {
      if (lastTime !== null) {
        elapsed += time - lastTime;
        let stepped = false;

        while (true) {
          const tickMs = getBaseTickMs(simRef.current.score);
          if (elapsed < tickMs) {
            break;
          }
          elapsed -= tickMs;
          const result = stepSimulation(simRef.current);
          if (result.gameOver) {
            simRef.current = result.next;
            syncFromSim(result.next);
            setIsGameOver(true);
            const nextHigh = saveSnakeHighScore(result.next.score);
            setHighScore(nextHigh);
            return;
          }

          simRef.current = result.next;
          stepped = true;
        }

        if (stepped) {
          syncFromSim(simRef.current);
        }
      }
      lastTime = time;
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafId);
    };
  }, [isGameOver, isStarted, syncFromSim]);

  return {
    snake,
    food,
    score,
    highScore,
    isGameOver,
    isStarted,
    setDirection,
    startGame,
    resetGame,
    persistScore,
  };
}
