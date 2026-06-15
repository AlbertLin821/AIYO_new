export const SNAKE_STORAGE_KEY = "aiyo-snake-high-score";

export function getSnakeHighScore(): number {
  if (typeof window === "undefined") {
    return 0;
  }
  const saved = window.localStorage.getItem(SNAKE_STORAGE_KEY);
  const parsed = saved ? Number.parseInt(saved, 10) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

export function saveSnakeHighScore(score: number): number {
  if (typeof window === "undefined") {
    return score;
  }
  const next = Math.max(getSnakeHighScore(), Math.max(0, Math.floor(score)));
  window.localStorage.setItem(SNAKE_STORAGE_KEY, String(next));
  return next;
}
