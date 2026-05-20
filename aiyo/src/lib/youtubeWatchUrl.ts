/**
 * YouTube watch URLs & `t` / `start` query parsing for timestamp cards and chat sources.
 */

/** Display clock like 3:05 or 1:02:03 (hours only if needed). */
export function formatSecondsAsClock(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) {
    return "0:00";
  }
  const s = Math.floor(totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }
  return `${m}:${String(sec).padStart(2, "0")}`;
}

export function buildYoutubeWatchUrl(videoId: string, startSeconds?: number): string {
  const base = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
  if (typeof startSeconds === "number" && Number.isFinite(startSeconds) && startSeconds >= 0) {
    const t = Math.floor(startSeconds);
    return `${base}&t=${t}s`;
  }
  return base;
}

function parseYoutubeTParam(raw: string): number | undefined {
  const t = raw.trim();
  if (!t) {
    return undefined;
  }
  if (/^\d+$/.test(t)) {
    return Number.parseInt(t, 10);
  }
  let sec = 0;
  let found = false;
  const h = /(\d+)h/i.exec(t);
  const m = /(\d+)m/i.exec(t);
  const s = /(\d+)s/i.exec(t);
  if (h) {
    sec += Number.parseInt(h[1], 10) * 3600;
    found = true;
  }
  if (m) {
    sec += Number.parseInt(m[1], 10) * 60;
    found = true;
  }
  if (s) {
    sec += Number.parseInt(s[1], 10);
    found = true;
  }
  return found ? sec : undefined;
}

/** Parse `t` or `start` from a YouTube watch URL (common chat/LLM citation shapes). */
export function parseYoutubeTimeFromUrl(url: string): { startSeconds?: number } {
  try {
    const u = new URL(url);
    if (!u.hostname.includes("youtube.com") && !u.hostname.includes("youtu.be")) {
      return {};
    }
    if (u.hostname.includes("youtu.be")) {
      const start = u.searchParams.get("t") ?? u.searchParams.get("start");
      if (!start) {
        return {};
      }
      const startSeconds = parseYoutubeTParam(start);
      return startSeconds !== undefined ? { startSeconds } : {};
    }
    const raw = u.searchParams.get("t") ?? u.searchParams.get("start");
    if (!raw) {
      return {};
    }
    const startSeconds = parseYoutubeTParam(raw);
    return startSeconds !== undefined ? { startSeconds } : {};
  } catch {
    return {};
  }
}
