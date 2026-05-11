const STORAGE_KEY = "aiyo:auto-import-video-places";

export function getAutoImportVideoPlacesEnabled(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return window.localStorage.getItem(STORAGE_KEY) === "1";
}

export function setAutoImportVideoPlacesEnabled(enabled: boolean): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
}
