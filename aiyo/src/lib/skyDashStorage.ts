export const SKY_DASH_STORAGE_KEY = "aiyo-sky-dash-high-score";

export function getSkyDashHighScore(): number {
  if (typeof window === "undefined") {
    return 0;
  }
  const saved = window.localStorage.getItem(SKY_DASH_STORAGE_KEY);
  const parsed = saved ? Number.parseInt(saved, 10) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

export function saveSkyDashHighScore(score: number): number {
  if (typeof window === "undefined") {
    return score;
  }
  const next = Math.max(getSkyDashHighScore(), Math.max(0, Math.floor(score)));
  window.localStorage.setItem(SKY_DASH_STORAGE_KEY, String(next));
  return next;
}
