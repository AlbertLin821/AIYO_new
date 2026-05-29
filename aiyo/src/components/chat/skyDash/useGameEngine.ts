import { useState, useEffect, useCallback, useRef } from "react";
import { getSkyDashHighScore, saveSkyDashHighScore } from "@/lib/skyDashStorage";

export const GAME_WIDTH = 400;
export const GAME_HEIGHT = 600;
export const AIRPLANE_SIZE = 40;
export const BUILDING_WIDTH = 60;
export const BUILDING_GAP = 180;
const GRAVITY = 0.1;
const JUMP_STRENGTH = -3;
const INITIAL_GAME_SPEED = 1.5;
const SPEED_INCREMENT = 0.1;
const SPEED_INTERVAL_MS = 2000;
const SCORE_INTERVAL_MS = 1000;
const BUILDING_SPACING = 250;
const INITIAL_BUILDING_DELAY = 600;
const AIRPLANE_X = 50;

interface Building {
  id: number;
  x: number;
  topHeight: number;
}

type SimulationState = {
  airplaneY: number;
  velocity: number;
  buildings: Building[];
  score: number;
  gameSpeed: number;
};

function createInitialSimulation(): SimulationState {
  return {
    airplaneY: GAME_HEIGHT / 2,
    velocity: 0,
    buildings: [],
    score: 0,
    gameSpeed: INITIAL_GAME_SPEED,
  };
}

function stepSimulation(
  state: SimulationState,
  allocBuildingId: () => number,
): { next: SimulationState; gameOver: boolean } {
  let gameOver = false;
  const nextY = state.airplaneY + state.velocity;
  if (nextY < 0 || nextY + AIRPLANE_SIZE > GAME_HEIGHT) {
    gameOver = true;
  }

  const velocity = state.velocity + GRAVITY;
  let buildings = state.buildings
    .map((building) => ({ ...building, x: building.x - state.gameSpeed }))
    .filter((building) => building.x + BUILDING_WIDTH > 0);

  const lastBuilding = buildings[buildings.length - 1];
  const spawnX = lastBuilding ? lastBuilding.x : INITIAL_BUILDING_DELAY;

  if (!lastBuilding || GAME_WIDTH - lastBuilding.x >= BUILDING_SPACING) {
    if (!lastBuilding && spawnX === INITIAL_BUILDING_DELAY) {
      buildings = [
        ...buildings,
        {
          id: allocBuildingId(),
          x: INITIAL_BUILDING_DELAY,
          topHeight: Math.random() * (GAME_HEIGHT - BUILDING_GAP - 100) + 50,
        },
      ];
    } else if (lastBuilding && GAME_WIDTH - lastBuilding.x >= BUILDING_SPACING) {
      buildings = [
        ...buildings,
        {
          id: allocBuildingId(),
          x: GAME_WIDTH,
          topHeight: Math.random() * (GAME_HEIGHT - BUILDING_GAP - 100) + 50,
        },
      ];
    }
  }

  const airplaneY = gameOver ? state.airplaneY : nextY;
  for (const building of buildings) {
    if (AIRPLANE_X + AIRPLANE_SIZE > building.x && AIRPLANE_X < building.x + BUILDING_WIDTH) {
      if (airplaneY < building.topHeight || airplaneY + AIRPLANE_SIZE > building.topHeight + BUILDING_GAP) {
        gameOver = true;
        break;
      }
    }
  }

  return {
    next: {
      airplaneY,
      velocity,
      buildings,
      score: state.score,
      gameSpeed: state.gameSpeed,
    },
    gameOver,
  };
}

export function useGameEngine() {
  const simRef = useRef<SimulationState>(createInitialSimulation());
  const buildingIdRef = useRef(0);
  const [airplaneY, setAirplaneY] = useState(GAME_HEIGHT / 2);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(() => getSkyDashHighScore());
  const [isGameOver, setIsGameOver] = useState(false);
  const [isStarted, setIsStarted] = useState(false);

  const allocBuildingId = useCallback(() => {
    buildingIdRef.current += 1;
    return buildingIdRef.current;
  }, []);

  const syncFromSim = useCallback((state: SimulationState) => {
    setAirplaneY(state.airplaneY);
    setBuildings(state.buildings);
    setScore(state.score);
  }, []);

  const jump = useCallback(() => {
    if (isGameOver) {
      return;
    }
    if (!isStarted) {
      setIsStarted(true);
      return;
    }
    simRef.current = { ...simRef.current, velocity: JUMP_STRENGTH };
  }, [isGameOver, isStarted]);

  const resetGame = useCallback(() => {
    simRef.current = createInitialSimulation();
    buildingIdRef.current = 0;
    syncFromSim(simRef.current);
    setIsGameOver(false);
    setIsStarted(false);
  }, [syncFromSim]);

  const persistScore = useCallback(() => {
    const next = saveSkyDashHighScore(simRef.current.score);
    setHighScore(next);
    return next;
  }, []);

  useEffect(() => {
    if (!isStarted || isGameOver) {
      return;
    }

    let rafId = 0;
    let lastTime: number | null = null;
    let scoreElapsed = 0;
    let speedElapsed = 0;

    const tick = (time: number) => {
      if (lastTime !== null) {
        const deltaMs = time - lastTime;
        let state = simRef.current;

        const stepped = stepSimulation(state, allocBuildingId);
        state = stepped.next;
        if (stepped.gameOver) {
          simRef.current = state;
          syncFromSim(state);
          setIsGameOver(true);
          const nextHigh = saveSkyDashHighScore(state.score);
          setHighScore(nextHigh);
          return;
        }

        scoreElapsed += deltaMs;
        if (scoreElapsed >= SCORE_INTERVAL_MS) {
          scoreElapsed %= SCORE_INTERVAL_MS;
          state = { ...state, score: state.score + 1 };
        }

        speedElapsed += deltaMs;
        if (speedElapsed >= SPEED_INTERVAL_MS) {
          speedElapsed %= SPEED_INTERVAL_MS;
          state = { ...state, gameSpeed: state.gameSpeed + SPEED_INCREMENT };
        }

        simRef.current = state;
        syncFromSim(state);
      }
      lastTime = time;
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafId);
    };
  }, [allocBuildingId, isGameOver, isStarted, syncFromSim]);

  return {
    airplaneY,
    buildings,
    score,
    highScore,
    isGameOver,
    isStarted,
    jump,
    resetGame,
    persistScore,
  };
}
