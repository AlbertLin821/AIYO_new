/** Session resume after login: guest video import selection. */

export const PENDING_VIDEO_IMPORT_STORAGE_KEY = "aiyo:pendingVideoImport:v1";

export type PendingVideoImportPayload = {
  videoId: string;
  selectedNames: string[];
  targetDay: number;
};

export function savePendingVideoImport(payload: PendingVideoImportPayload): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.sessionStorage.setItem(PENDING_VIDEO_IMPORT_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // ignore quota / private mode
  }
}

export function readPendingVideoImport(): PendingVideoImportPayload | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.sessionStorage.getItem(PENDING_VIDEO_IMPORT_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as PendingVideoImportPayload;
    if (
      typeof parsed?.videoId !== "string" ||
      !Array.isArray(parsed.selectedNames) ||
      typeof parsed.targetDay !== "number"
    ) {
      return null;
    }
    return {
      videoId: parsed.videoId,
      selectedNames: parsed.selectedNames.filter((n) => typeof n === "string"),
      targetDay: Math.max(1, Math.floor(parsed.targetDay)),
    };
  } catch {
    return null;
  }
}

export function clearPendingVideoImport(): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.sessionStorage.removeItem(PENDING_VIDEO_IMPORT_STORAGE_KEY);
  } catch {
    // ignore
  }
}
