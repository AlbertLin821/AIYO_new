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
  ollamaModel: readString("OLLAMA_MODEL", "gemma4:26B"),
  ollamaSummaryModel: readString(
    "OLLAMA_VIDEO_SUMMARY_MODEL",
    readString("OLLAMA_SUMMARY_MODEL", "gemma4:26B"),
  ),
  ollamaFastSummaryModel: readString("OLLAMA_VIDEO_SUMMARY_FAST_MODEL", "mistral-small:24b"),
  ollamaFinalSummaryModel: readString("OLLAMA_VIDEO_SUMMARY_FINAL_MODEL", "gemma4:26B"),
  ollamaLocationModel: readString("OLLAMA_LOCATION_MODEL", "qwen3.6:27b"),
  ollamaTimeoutMs: readNumber("OLLAMA_TIMEOUT_MS", 45000),
  mem0BaseUrl: readString("MEM0_BASE_URL", "http://localhost:8890"),
  mem0Enabled: readBoolean("MEM0_ENABLED", false),
  mem0TopK: readNumber("MEM0_TOP_K", 5),
  mem0TimeoutMs: readNumber("MEM0_TIMEOUT_MS", 12000),
  enableMockVideoProvider: readBoolean("ENABLE_MOCK_VIDEO_PROVIDER", false),
  enableMockMaps: readBoolean("ENABLE_MOCK_MAPS", false),
  youtubeApiKey: readString("YOUTUBE_API_KEY", ""),
  googleMapsApiKey: readString("GOOGLE_MAPS_API_KEY", ""),
  /** Tavily Search API (https://tavily.com) for web research in travel chat and segment hints. */
  tavilyApiKey: readString("TAVILY_API_KEY", ""),
};
