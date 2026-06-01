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

const ollamaModel = readString("OLLAMA_MODEL", "qwen3.5:9b");

export const serverConfig = {
  appName: readString("NEXT_PUBLIC_APP_NAME", "AIYO"),
  ollamaBaseUrl: readString("OLLAMA_BASE_URL", "http://localhost:11434"),
  ollamaModel,
  /** 語音／POST /api/ai/plan 行程 JSON；未設定時與 `OLLAMA_MODEL` 相同。 */
  ollamaTripPlanModel: readString("OLLAMA_TRIP_PLAN_MODEL", "granite4.1:3b"),
  /** 旅遊聊天／結構化回覆；未設定時與 `OLLAMA_MODEL` 相同。 */
  ollamaTravelChatModel: readString("OLLAMA_TRAVEL_CHAT_MODEL", ollamaModel),
  ollamaSummaryModel: readString(
    "OLLAMA_VIDEO_SUMMARY_MODEL",
    readString("OLLAMA_SUMMARY_MODEL", "granite4.1:8b"),
  ),
  ollamaFastSummaryModel: readString("OLLAMA_VIDEO_SUMMARY_FAST_MODEL", "mistral-small:24b"),
  ollamaFinalSummaryModel: readString("OLLAMA_VIDEO_SUMMARY_FINAL_MODEL", "granite4.1:8b"),
  ollamaLocationModel: readString("OLLAMA_LOCATION_MODEL", "granite4.1:8b"),
  videoExtractionMode: readString("VIDEO_EXTRACTION_MODE", "simple-ollama"),
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
  /** 單次 Ollama HTTP 請求逾時（毫秒）。較大的本機模型建議 180000–300000。 */
  ollamaTimeoutMs: readNumber("OLLAMA_TIMEOUT_MS", 180000),
  /** 單次請求允許的上限（避免環境變數誤設過大）；預設 10 分鐘。 */
  ollamaTimeoutCapMs: readNumber("OLLAMA_TIMEOUT_CAP_MS", 600_000),
  /** 逾時時的自動重試次數（僅 travel chat compose 流程使用）。 */
  ollamaTimeoutRetryCount: Math.max(0, Math.floor(readNumber("OLLAMA_TIMEOUT_RETRY_COUNT", 1))),
  /** 每次 timeout 重試前等待毫秒數。 */
  ollamaTimeoutRetryDelayMs: Math.max(0, readNumber("OLLAMA_TIMEOUT_RETRY_DELAY_MS", 400)),
  /** 支援 thinking control 的 Ollama 模型會依此開關啟用／關閉 thinking；預設關閉以縮短聊天延遲。 */
  ollamaThink: readBoolean("OLLAMA_THINK", false),
  /** 影片地點擷取／影片摘要相關任務保留 thinking，以提高地點召回與判斷品質。 */
  ollamaVideoThink: readBoolean("OLLAMA_VIDEO_THINK", true),
  videoExtractionChunkMaxChars: readNumber("VIDEO_EXTRACTION_CHUNK_MAX_CHARS", 12000),
  videoExtractionChunkOverlapChars: readNumber("VIDEO_EXTRACTION_CHUNK_OVERLAP_CHARS", 500),
  videoExtractionChunkMaxCount: readNumber("VIDEO_EXTRACTION_CHUNK_MAX_COUNT", 8),
  videoExtractionChunkConcurrency: readNumber("VIDEO_EXTRACTION_CHUNK_CONCURRENCY", 1),
  videoExtractionOptionalVerify: readBoolean("VIDEO_EXTRACTION_OPTIONAL_VERIFY", false),
  mem0BaseUrl: readString("MEM0_BASE_URL", "http://localhost:8890"),
  mem0Enabled: readBoolean("MEM0_ENABLED", true),
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
  /**
   * AI 對話與行程生成只允許 `auto` | `serper` | `tavily`。
   * `auto`: Serper (if SERPER_API_KEY) → Tavily → none.
   * SearXNG 設定保留給舊版非 AI 搜尋模組；AI 搜尋不得 fallback 到 SearXNG。
   */
  webSearchProvider: readString("WEB_SEARCH_PROVIDER", "auto").toLowerCase(),
  serperApiKey: readString("SERPER_API_KEY", ""),
  /** When no live provider is usable, return deterministic mock rows (dev/demo only). */
  aiWebSearchMock: readBoolean("AIYO_WEB_SEARCH_MOCK", false),
  travelResearchProviderTimeoutMs: readNumber("TRAVEL_RESEARCH_PROVIDER_TIMEOUT_MS", 12000),
  travelSearchCacheTtlMs: readNumber("TRAVEL_SEARCH_CACHE_TTL_MS", 300000),
};
