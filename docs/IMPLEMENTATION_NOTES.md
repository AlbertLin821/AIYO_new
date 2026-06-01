# IMPLEMENTATION_NOTES — AIYO_new x Onyx 對齊

## 2026-05-17 — Phase 0：架構掃描與 Gap Report

### 完成項目

- 掃描 `AIYO_new/aiyo`：Next.js 16、Prisma/PostgreSQL、NextAuth、Ollama、既有 chat / map / youtube / search API 與 `SourceTag` 流程。
- 掃描 `F:\Projects\Githubs\onyx`（read-only）：`widget` citation + SSE、`web` agents、backend `streaming_models` 與 connector 生態之 **參考位置**。
- 新增 **`docs/AIYO_ONYX_GAP_REPORT.md`**（Architecture Gap Report、Gap 表、PR 計畫、PR 1 檔案清單）。
- **未修改** Onyx、**未修改** AIYO 功能程式碼與設定檔。

### 指令

- Gap report 階段無需執行 `lint` / `build`（無程式變更）。

---

## 2026-05-17 — PR1：Grounded Chat Contract（型別 + mock + Citation UI）

### 完成項目

- 新增 `aiyo/src/lib/types/`：`sources`、`chat`（含 `GroundedChatMessage`）、`itinerary`、`tools`、barrel `index.ts`。
- 新增 `aiyo/src/lib/mocks/groundedChatMock.ts`：YouTube / 網頁 / Google Place 三種 `SourceReference`；mock trip 2 天 × 每天至少 3 筆 item（`sourceIds`）；`createMockGroundedAssistantMessage()`。
- 新增 `SourceBadge`、`CitationList`（dedupe、`+N 更多`、hover 預覽、Esc / Enter）。
- `ChatMessage` 延伸：`sourceReferences`、`toolCalls`、`itineraryPatch`、`metadata`。
- `/chat`：標題列與空狀態可「載入可溯源範例」；助理訊息底部顯示 `CitationList`。

### 驗證

- `cd aiyo && npm run lint && npm run build` 已通過。

### 後續（PR2+）

- ~~`SourceDrawer`、行程卡 source badges、與既有 `SourceTag` / DB 持久化合流。~~ → PR2 已完成 Drawer + 行程 citation UI；DB 持久化合流仍留待後續 PR。

---

## 2026-05-17 — PR2：Source hover 統一、側邊詳情、行程引用與型別卡片

### 完成項目

- **`SourceHoverCard`**：從 hover 浮層抽成共用元件（loading / error / empty 預留 props，目前由 `SourceBadge` 以同步資料使用）。
- **`SourceDrawer`**：右側滑入面板（framer-motion）、依 `SourceReference.type` 顯示 `YouTubeSourceCard` / `WebsiteSourceCard` / `MapPlaceSourceCard` 或泛用摘要；底部「在新分頁開啟」使用 **`lib/sources/externalUrl.ts`** 的 `buildSourceExternalUrl`。
- **`chatSourceAdapter`**：`ChatSource` → `SourceReference`；YouTube 不再錯掛 `website` 區塊；`web` / `official` 才帶 `website`。
- **`SourceBadge`**：改用 `SourceHoverCard`；可選 **`onOpenDetail`** → 浮層內「側邊檢視詳情」。
- **`CitationList`**：可選 **`onOpenSourceDetail`**，轉傳給各 `SourceBadge`。
- **`/chat`**：`sourceDrawerSource` 狀態 + `SourceDrawer`；`CitationList` 與 `TravelPlanCard` 皆接上 `handleOpenSourceDrawer`。
- **`CitationGroup`**（`SourceTag.tsx`）：若傳入 **`onOpenGroundedDetail`**，以 `chatSourcesRecordToReferences` + `CitationList` 顯示 grounded badges（否則維持既有 `SourceTag` + preview API）。
- **`TravelPlanCard` / `TravelPlanDayAccordion`**：新增 **`onOpenGroundedSource` / `onOpenGroundedDetail`**，將行程內 citations 接到同一套側邊詳情。

### 驗證

- `cd aiyo && npm run lint && npm run build && npm test` 已通過（168 tests）。

---

## 2026-05-17 — PR3：Tool registry、Chat 工具狀態橋接、Workflow UI

### 完成項目

- **`lib/tools/tool-registry.ts`**：`TRAVEL_CHAT_TOOLS`（意圖解析、網搜、YouTube、地點、天氣、路徑估算、行程寫入、生成回覆、來源對齊）；`safeToAutoRun` / `requiresUserApproval` / `defaultChatToolStatus`；`getTravelTool`、`listTravelTools`、`isTravelToolId`。
- **`lib/chat/chatToolBridge.ts`**：`statusStepToChatToolStatus`（`StatusStepPayload` + `provider` → `ChatToolStatus`）、`inferChatToolStatusFromSteps`、`formatChatToolStatusLabel`（zh-TW）。
- **`lib/chat/chatOrchestrator.ts`**：薄層 re-export（供 UI / 服務單一 import）。
- **`lib/types/index.ts`**：re-export `TravelToolId`、`TravelToolDefinition`。
- **`ChatWorkflowRail`**：處理中或「等你回覆」時顯示 **「工具狀態 · …」** 一行。
- **`lib/chat/chatToolBridge.test.ts`**：對應單元測試。

### 未納入（後續）

- 獨立 SSE `event: tool_progress` 與 `POST /api/chat` 合併仍保留給之後 PR；目前工具狀態由既有 **`status_step`** 串流在客戶端推斷。

### 驗證

- `cd aiyo && npm run lint && npm run build && npm test` 已通過（173 tests）。

---

## 2026-05-17 — PR4：Trip 深連結頁 `/trip/[id]`（地圖 + 行程面板同步）

### 完成項目

- **`app/trip/[id]/page.tsx`**：依網址 `id` 呼叫 `setActiveTrip` → `syncService.applyTripSwitch` → `startRealtime`；未登入導向 `login` 並帶 `callbackUrl`；錯誤時顯示訊息與返回行程庫連結；預設 `setPanelOpen(true)` 以露出時間軸／列表（與 `MapView` 的 `selectedPinId` 雙向選取沿用既有邏輯）。
- **`app/trip/[id]/loading.tsx`**：全頁載入占位。
- **`TripLandingCard`**：可選 **`tripMapHref`**（行程庫卡片上「地圖檢視」連結至 `/trip/[id]`）。
- **`locales/zh-TW.ts`**：`tripMapPage` 字串。

### 驗證

- 見下方「PR4 補強：行程順序編號標記」；`npm test` 目前為 **176** 則。

---

## 2026-05-17 — PR4 補強：行程順序編號標記（Gap「numbered markers」）

### 完成項目

- **`lib/mapPinItineraryLink.ts`**：`findLinkedPinForItem`、`buildPinStopOrderByPinId`（依天／項目順序為 pin 編 1…n；同一 pin 僅首次出現計號）。
- **`mapPinIcon.ts`**：`encodeMapPinDataUrl` / `createMapPinElement` / `mapPinSvgString` 可選 **停靠序號**（SVG 白字於 pin 上緣）。
- **`MapView`**：`pinStopById` 餵入 AdvancedMarker、legacy `Marker` 與 **`MockMapFallback`**。
- **`MapPinMarker`**（mock UI）：可選 **`stopOrder`** 圓形徽章。
- **`ItineraryPanel`**：改為自 **`mapPinItineraryLink`** 匯入 `findLinkedPinForItem`（移除重複實作）。
- **`lib/mapPinItineraryLink.test.ts`**：3 則單元測試。

### 驗證

- `cd aiyo && npm run lint && npm run build && npm test` 已通過（176 tests）。

---

## 2026-05-17 — PR5：YouTube 時間戳卡片、segment ↔ 地點、摘要 connector

### 完成項目

- **`lib/youtubeWatchUrl.ts`**：`formatSecondsAsClock`、`buildYoutubeWatchUrl`、`parseYoutubeTimeFromUrl`（`t` / `start`，支援秒數與 `1m30s` 等）。
- **`lib/types/sources.ts`**：`SourceReference.youtube` 擴充 **`segmentTitle`**、**`locationHints`**。
- **`chatSourceAdapter`**：自引用網址解析 **`startSeconds`**，供 `YouTubeSourceCard` 深連結。
- **`YouTubeSourceCard`**：設計系統色票（cream / border / primary chips）、段落標題、地點提示、`buildYoutubeWatchUrl` 統一輸出。
- **`VideoSummaryDrawer`**：重點片段列顯示 **`locationHints`**、摘要／highlight 一句、**「在 YouTube 開啟此片段」**（需可解析 seek 秒數與 `videoId`）。
- **`server/services/videoSummaryConnector.ts`**：`summarizeVideoForApi` → 預設走真實 **`summarizeVideo`**；環境變數 **`AIYO_VIDEO_SUMMARY_MOCK=1`** 時回傳 **`lib/mocks/videoSummaryResultFixture`**。
- **`app/api/videos/summarize/route.ts`**（及 re-export 之 **`/api/youtube/analyze`**）改經 connector。
- **`lib/__tests__/youtubeWatchUrl.test.ts`**：URL／時鐘格式化單元測試。

### 驗證

- `cd aiyo && npm run lint && npm run build && npm test` 已通過（**179** tests）。

---

## 2026-05-17 — PR6：網搜統一、RAG-lite（記憶檢索）、行程 Markdown 匯出

### 完成項目

- **統一網搜**：`server/search/webSearchService.ts` 的 `runUnifiedWebSearch`；`auto` 順序為 **Serper（有 `SERPER_API_KEY`）→ Tavily（有 key）→ SearxNG（啟用）→ mock（`AIYO_WEB_SEARCH_MOCK=1`）**。可強制 **`WEB_SEARCH_PROVIDER=auto|serper|tavily|searxng|mock`**。Serper 實作於 `server/search/serperClient.ts`；mock 於 `server/search/mockWebSearch.ts`。
- **設定**：`server/config.ts` — `webSearchProvider`、`serperApiKey`、`aiWebSearchMock`（沿用既有 Tavily / Searx 欄位）。
- **行程規劃**：`travelPlannerService.runWebSearch` 改呼叫 `runUnifiedWebSearch`；`StatusStepProvider` 新增 **`serper`**、**`mock_web`**。
- **`POST /api/search/web`**：回傳 **`data.provider`**（實際後端：`serper` | `tavily` | `searxng` | `mock_web`）。
- **Grounded 來源**：`lib/sources/webSearchToSourceReferences.ts` — `webSearchResultsToSourceReferences` / `chatSourcesRecordToReferences` → `SourceReference[]`。
- **RAG-lite**：`server/memory/memoryRetrieval.ts` — Mem0 開啟時優先語意搜尋，否則 **list + 關鍵字排序**；**`POST /api/memories/retrieve`**（需登入），body：`{ query, topK? }`。主流程 **`/api/ai/chat`**、**`/api/trip/revise`**、**`/api/ai/plan`** 的 `memoryContext` 皆改經 **`retrieveRelevantMemoriesForUser`**，與上述 API 同一套檢索邏輯。
- **行程匯出**：`server/export/tripMarkdown.ts` 的 `buildTripMarkdown`；**`GET /api/trips/[id]/export/markdown`**（需登入且具 **view** 權限），`Content-Type: text/markdown` 下載。
- **偏好**：仍使用既有 **`GET/PUT /api/profile`**，未另建大型 preference 服務。

### 環境變數（摘要）

| 變數 | 說明 |
|------|------|
| `WEB_SEARCH_PROVIDER` | `auto`（預設）或 `serper` / `tavily` / `searxng` / `mock` |
| `SERPER_API_KEY` | Serper Google Search API |
| `AIYO_WEB_SEARCH_MOCK` | `1` 啟用離線示範結果（亦受 unified 邏輯約束） |

### 驗證

- `cd aiyo && npm run lint && npm run build && npm test` 已通過（**181** tests）。
