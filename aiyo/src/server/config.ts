function readString(name: string, fallback = ""): string {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : fallback;
}

function readNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readBoolean(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }
  return raw.toLowerCase() === "true";
}

export const serverConfig = {
  appName: readString("NEXT_PUBLIC_APP_NAME", "AIYO"),
  ollamaBaseUrl: readString("OLLAMA_BASE_URL", "http://localhost:11434"),
  ollamaModel: readString("OLLAMA_MODEL", "gemma3:4b"),
  ollamaSummaryModel: readString("OLLAMA_SUMMARY_MODEL", ""),
  ollamaLocationModel: readString("OLLAMA_LOCATION_MODEL", ""),
  ollamaTimeoutMs: readNumber("OLLAMA_TIMEOUT_MS", 45000),
  enableMockVideoProvider: readBoolean("ENABLE_MOCK_VIDEO_PROVIDER", false),
  enableMockMaps: readBoolean("ENABLE_MOCK_MAPS", false),
  youtubeApiKey: readString("YOUTUBE_API_KEY", ""),
  googleMapsApiKey: readString("GOOGLE_MAPS_API_KEY", ""),
};
