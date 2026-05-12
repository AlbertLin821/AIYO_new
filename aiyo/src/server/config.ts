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

const ollamaModel = readString("OLLAMA_MODEL", "gemma4:26B");

export const serverConfig = {
  appName: readString("NEXT_PUBLIC_APP_NAME", "AIYO"),
  ollamaBaseUrl: readString("OLLAMA_BASE_URL", "http://localhost:11434"),
  ollamaModel,
  /** 語音／POST /api/ai/plan 行程 JSON；未設定時與 `OLLAMA_MODEL` 相同。 */
  ollamaTripPlanModel: readString("OLLAMA_TRIP_PLAN_MODEL", ollamaModel),
  ollamaSummaryModel: readString(
    "OLLAMA_VIDEO_SUMMARY_MODEL",
    readString("OLLAMA_SUMMARY_MODEL", "gemma4:26B"),
  ),
  ollamaFastSummaryModel: readString("OLLAMA_VIDEO_SUMMARY_FAST_MODEL", "mistral-small:24b"),
  ollamaFinalSummaryModel: readString("OLLAMA_VIDEO_SUMMARY_FINAL_MODEL", "gemma4:26B"),
  ollamaLocationModel: readString("OLLAMA_LOCATION_MODEL", "qwen3.6:27b"),
  /**
   * 影片時間段落：在規則錨點產生後，以 Ollama `format: "json"` 拋光標題／摘要／地點提示。
   * 失敗時自動退回原片段，不影響地圖座標管線。
   */
  ollamaVideoSegmentJsonPolish: readBoolean("OLLAMA_VIDEO_SEGMENT_JSON_POLISH", true),
  /**
   * 在地理編碼前，以 `OLLAMA_LOCATION_MODEL` + JSON 再過濾候選地名（偏寬泛詞剔除）。
   * 預設關閉；與 `isGenericTravelLocation` 並存時為第二道閘門。
   */
  ollamaVideoLocationJsonFilter: readBoolean("OLLAMA_VIDEO_LOCATION_JSON_FILTER", false),
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
  searxngBaseUrl: readString("SEARXNG_BASE_URL", "http://localhost:8081"),
  searxngInternalBaseUrl: readString("SEARXNG_INTERNAL_BASE_URL", "http://searxng:8080"),
  searxngEnabled: readBoolean("SEARXNG_ENABLED", true),
  searxngTimeoutMs: readNumber("SEARXNG_TIMEOUT_MS", 12000),
  searxngDefaultLanguage: readString("SEARXNG_DEFAULT_LANGUAGE", "zh-TW"),
  searxngDefaultCategories: readString("SEARXNG_DEFAULT_CATEGORIES", "general"),
  searxngResultLimit: readNumber("SEARXNG_RESULT_LIMIT", 8),
  searxngSafeSearch: readNumber("SEARXNG_SAFE_SEARCH", 1),
  videoPlaceRequireVerification: readBoolean("VIDEO_PLACE_REQUIRE_VERIFICATION", true),
  videoPlaceAllowHeuristicFallback: readBoolean("VIDEO_PLACE_ALLOW_HEURISTIC_FALLBACK", false),
  videoPlaceEnableOllamaCandidates: readBoolean("VIDEO_PLACE_ENABLE_OLLAMA_CANDIDATES", true),
  videoPlaceEnableNominatim: readBoolean("VIDEO_PLACE_ENABLE_NOMINATIM", false),
  videoPlaceMaxCandidates: readNumber("VIDEO_PLACE_MAX_CANDIDATES", 24),
  videoPlaceMaxFinalPlaces: readNumber("VIDEO_PLACE_MAX_FINAL_PLACES", 16),
  aiWebSearchEnabled: readBoolean("AI_WEB_SEARCH_ENABLED", true),
  aiWebSearchMaxResults: readNumber("AI_WEB_SEARCH_MAX_RESULTS", 6),
  aiWebSearchRequireCitations: readBoolean("AI_WEB_SEARCH_REQUIRE_CITATIONS", true),
};
