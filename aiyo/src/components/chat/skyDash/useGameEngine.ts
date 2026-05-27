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
const SPEED_INTERVAL = 2000;
const SCORE_INTERVAL = 1000;
const BUILDING_SPACING = 250;
const INITIAL_BUILDING_DELAY = 600;

interface Building {
  id: number;
  x: number;
  topHeight: number;
}

export function useGameEngine() {
  const [airplaneY, setAirplaneY] = useState(GAME_HEIGHT / 2);
  const [velocity, setVelocity] = useState(0);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [score, setScore] = useState(0);
  const [gameSpeed, setGameSpeed] = useState(INITIAL_GAME_SPEED);
  const [highScore, setHighScore] = useState(() => getSkyDashHighScore());
  const [isGameOver, setIsGameOver] = useState(false);
  const [isStarted, setIsStarted] = useState(false);

  const requestRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number | null>(null);
  const buildingIdRef = useRef(0);
  const frameLoopRef = useRef<(time: number) => void>(() => {});

  useEffect(() => {
    if (score > highScore) {
      const next = saveSkyDashHighScore(score);
      queueMicrotask(() => setHighScore(next));
    }
  }, [score, highScore]);

  useEffect(() => {
    let interval: number;
    if (isStarted && !isGameOver) {
      interval = window.setInterval(() => {
        setGameSpeed((prev) => prev + SPEED_INCREMENT);
      }, SPEED_INTERVAL);
    }
    return () => window.clearInterval(interval);
  }, [isStarted, isGameOver]);

  useEffect(() => {
    let interval: number;
    if (isStarted && !isGameOver) {
      interval = window.setInterval(() => {
        setScore((prev) => prev + 1);
      }, SCORE_INTERVAL);
    }
    return () => window.clearInterval(interval);
  }, [isStarted, isGameOver]);

  const jump = useCallback(() => {
    if (isGameOver) {
      return;
    }
    if (!isStarted) {
      setIsStarted(true);
      return;
    }
    setVelocity(JUMP_STRENGTH);
  }, [isGameOver, isStarted]);

  const resetGame = useCallback(() => {
    setAirplaneY(GAME_HEIGHT / 2);
    setVelocity(0);
    setBuildings([]);
    setScore(0);
    setGameSpeed(INITIAL_GAME_SPEED);
    setIsGameOver(false);
    setIsStarted(false);
    buildingIdRef.current = 0;
    lastTimeRef.current = null;
  }, []);

  const persistScore = useCallback(() => {
    const next = saveSkyDashHighScore(score);
    setHighScore(next);
    return next;
  }, [score]);

  const update = useCallback(
    (time: number) => {
      if (lastTimeRef.current !== null && isStarted && !isGameOver) {
        setAirplaneY((prevY) => {
          const nextY = prevY + velocity;
          if (nextY < 0 || nextY + AIRPLANE_SIZE > GAME_HEIGHT) {
            setIsGameOver(true);
          }
          return nextY;
        });
        setVelocity((prevVel) => prevVel + GRAVITY);

        setBuildings((prevBuildings) => {
          const newBuildings = prevBuildings
            .map((b) => ({ ...b, x: b.x - gameSpeed }))
            .filter((b) => b.x + BUILDING_WIDTH > 0);

          const lastBuilding = newBuildings[newBuildings.length - 1];
          const spawnX = lastBuilding ? lastBuilding.x : INITIAL_BUILDING_DELAY;

          if (!lastBuilding || GAME_WIDTH - lastBuilding.x >= BUILDING_SPACING) {
            if (!lastBuilding && spawnX === INITIAL_BUILDING_DELAY) {
              newBuildings.push({
                id: buildingIdRef.current++,
                x: INITIAL_BUILDING_DELAY,
                topHeight: Math.random() * (GAME_HEIGHT - BUILDING_GAP - 100) + 50,
              });
            } else if (lastBuilding && GAME_WIDTH - lastBuilding.x >= BUILDING_SPACING) {
              const topHeight = Math.random() * (GAME_HEIGHT - BUILDING_GAP - 100) + 50;
              newBuildings.push({
                id: buildingIdRef.current++,
                x: GAME_WIDTH,
                topHeight,
              });
            }
          }

          const airplaneX = 50;
          newBuildings.forEach((b) => {
            if (airplaneX + AIRPLANE_SIZE > b.x && airplaneX < b.x + BUILDING_WIDTH) {
              if (airplaneY < b.topHeight || airplaneY + AIRPLANE_SIZE > b.topHeight + BUILDING_GAP) {
                setIsGameOver(true);
              }
            }
          });

          return newBuildings;
        });
      }
      lastTimeRef.current = time;
      requestRef.current = requestAnimationFrame(frameLoopRef.current);
    },
    [isStarted, isGameOver, velocity, airplaneY, gameSpeed],
  );

  useEffect(() => {
    frameLoopRef.current = update;
  }, [update]);

  useEffect(() => {
    requestRef.current = requestAnimationFrame((time) => frameLoopRef.current(time));
    return () => {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
    };
  }, [update]);

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
