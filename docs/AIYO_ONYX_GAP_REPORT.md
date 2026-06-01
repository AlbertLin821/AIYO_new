# AIYO_new x Onyx Architecture Gap Report

> 產出日期：2026-05-17  
> AIYO_new 掃描根目錄：`AIYO_new/aiyo`（主要應用）  
> Onyx 參考路徑：`F:\Projects\Githubs\onyx`（僅 read-only 掃描，未修改）  
> 本階段範圍：文件與架構對照，**未修改任何功能程式碼**

---

## 1. Current AIYO_new Architecture

### 1.1 掃描摘要（AIYO_new Project Scan Summary）

| 項目 | 現況 |
|------|------|
| **Framework** | Next.js **16** App Router（`next@16.2.4`） |
| **Package manager** | **npm**（`aiyo/package.json`） |
| **Language** | **TypeScript** + React **19** |
| **Main app folder** | `aiyo/`（子目錄為單一主要產品；repo 另有 `vendor/`、`youtube-proj/` 等） |
| **ORM / Database** | **Prisma** + **PostgreSQL**（`prisma/schema.prisma`） |
| **Auth** | **NextAuth**（`@next-auth/prisma-adapter`） |
| **AI provider** | 主要為 **Ollama**（`src/server/ai/ollamaClient.ts`、`/api/ai/chat` 等）；非串流 `stream: false` 呼叫為主 |
| **Maps** | `/app/map/page.tsx`、BFF：`/api/map/place-details`、`/api/map/geocode` |
| **YouTube** | `youtube-transcript` 套件、`/api/youtube/analyze`、`VideoSummaryCache`（Prisma） |
| **Search** | `/api/search/web`（網搜能力已存在） |
| **Collaboration** | SSE：`/api/realtime/stream`（bootstrap snapshot）；presence、聊天進度：`/api/chat/stream/[sessionId]`（`status_step` 事件） |
| **Deployment** | Docker Compose（README：`aiyo-new-app`、Postgres、Redis）；標準 `next build` / `next start` |
| **Test commands** | `npm run lint`、`npm test`（`tsx --test`）、`npm run e2e`（Playwright） |
| **Risks** | README 提及 `cp .env.example` 但工作區內 **`.env.example` 可能未追蹤或缺失**（需後續確認）；型別集中於 `src/types/index.ts`，與 TODO 建議的 `src/lib/types/*` 分檔尚未對齊 |

### 1.2 Frontend

- **Chat**：`src/app/chat/page.tsx`（大型頁面：問答、行程建議、`CitationGroup` / `SourceTag` 整合）。
- **Itinerary**：`src/app/itinerary/page.tsx`、`TravelPlanCard`、`TravelPlanDayAccordion`。
- **Map**：`src/app/map/page.tsx`、`FloatingAIChat`、`VoicePlanningButton` 等。

### 1.3 Backend（BFF / Route Handlers）

代表性路由（非完整列舉）：

- `POST /api/ai/chat`、`POST /api/ai/plan`、`POST /api/ai/plan-trip`
- `POST /api/chat/message`、`GET /api/chat/messages`、`GET /api/chat/stream/[sessionId]`
- `GET /api/sources/[sourceId]/preview`（依 `sourcePreviewStore` 回傳預覽）
- `POST /api/search/web`、`POST /api/youtube/analyze`、`POST /api/videos/summarize`
- Trips CRUD：`/api/trips/*`

### 1.4 Database（Prisma 核心實體）

- **User / Profile**（偏好 JSON）
- **Trip / TripDay / TripItem / MapPin**
- **ChatMessage**（`role`, `content`, `tripId`）— **尚無獨立 `sources` / `citations` 欄位或關聯表**
- **VideoSummaryCache**（JSON）
- Collaboration：room、comments、presence 等

### 1.5 Sources / Citations（現有實作）

- LLM 回應經 **`travelPlannerService`** 等正規化；**`sourceNormalization.ts`** 產生 `source_id`（如 `src_*`, `yt_*`, `tavily_*`, `weather_*`）。
- UI：**`SourceTag` + `CitationGroup`**，以 **citation 字串陣列** 對應 `sources` map；預覽走 **`/api/sources/[id]/preview`** + 記憶體 store。
- 與 TODO 目標差異：尚未統一為強型別 **`SourceReference`**、`ChatToolStatus`、**`ItineraryPatch`** 等 **P0 contract**；DB 未持久化結構化來源物件。

---

## 2. Onyx Reference Architecture（可參考位置，未複製程式碼）

以下僅記錄 **掃描到的主要區域**，供設計比對用。

| 區域 | Onyx 參考位置（範例） | 備註 |
|------|------------------------|------|
| **Widget / Chat + Citation UI** | `widget/src/widget.ts` | `include-citations`、`citation-badge`、`citation-list`、串流中 strip `[[n]](url)`、解析後對應文件 |
| **Streaming / SSE 客戶端** | `widget/src/services/api-service.ts`、`widget/src/services/stream-parser.ts` | `parseSSEStream`、封包驅動狀態更新；型別註解連結 backend packet 結構 |
| **Web Chat / Agent** | `web/src/lib/agents/*`、`web/src/sections/sidebar/ChatButton.tsx` 等 | `persona_id`、pinned agents、自訂 agent 流程 |
| **MCP / Tools（整合測試）** | `web/tests/e2e/mcp/default-agent-mcp.spec.ts` | Tool 呼叫與權限測試模式 |
| **Backend streaming 模型** | `onyx.server.query_and_chat.streaming_models`（多處 test import） | 統一 streaming packet / section / tool delta 等 |
| **Connector / indexing** | `backend` 內 connector 與 metrics（如 `connector_type`） | 企業文件同步與索引管線；**不宜整包搬進 AIYO** |
| **E2E chat mock** | `web/tests/e2e/utils/chatMock.ts` | 串流 endpoint mock 模式可參考測試策略 |

**Notes：** Onyx 以 **企業知識庫 + 多 connector + 完整 agent 生態** 為主軸；AIYO_new 應聚焦 **trip / day / item / place / source / video_segment**，只借鏡 **citation 顯示、SSE 思考狀態、工具編排思想**，不複製權限與 connector 全貌。

---

## 3. Gap Table

| Area | AIYO_new Current | Onyx Reference | Gap | Priority | Proposed Fix |
|------|------------------|----------------|-----|----------|--------------|
| **Chat UI** | 功能完整但集中於 `chat/page.tsx`；已有 `SourceTag` | Widget 式 citation list、badge 一致化 | 元件可拆、與 contract 對齊；禁止 `[1]` 假引用需政策 + structured sources | **P0** | 引入 `CitationList` / `SourceBadge`（旅遊語意），底下接現有 `SourceTag` 或漸進替換 |
| **Streaming** | 進度用 SSE（`chat/stream`）；Ollama 多為非串流 JSON | 完整 token/SSE packet 管線 | 助理文字 token 串流與 **結構化 metadata**（sources、tool）可選式對齊 | **P0** | 定義 event 合約（`status` / `token` / `source` / `done`）；先保留非串流 fallback |
| **Source Citation** | 字串 id + in-memory preview store | 文件 citation 編號與 badge | 缺少穩定 **`SourceReference`**、與 DB/訊息關聯；YouTube timestamp / Place 型別未全面提升 | **P0** | 新增 `src/lib/types/sources.ts`（或合併既有 `types`）；mock 多型來源；後續 migration |
| **Travel Agent** | `travelPlannerService` 單一大服務 + prompt/JSON | 多 agent、persona、工具邊界 | 尚未 **TravelPlanner / Editor / Video / Grounding** 等拆分與 **intent** 路由 | **P0** | `agent-config.ts` + 薄層 orchestrator；逐步從現有服務抽出 |
| **Tool Calling** | 行程修訂、API 分散；無統一 registry | Tool registry + MCP 思想 | 無 **`ToolDefinition` / safeToAutoRun / requiresUserApproval** 統一模型 | **P0** | `tool-registry.ts` + mock tools；與 `allowItineraryMutation` 對齊 |
| **Itinerary Data Model** | Prisma `Trip`/`TripDay`/`TripItem` + 前端 `TripPlanDay` | 無需對齊 Onyx | TODO 的 `ItineraryPatch`、`TravelPreferences` 與現有 `TripPlanItem` **並存需對照映射** | **P0** | P0 types 作「API/訊息層」合約；Prisma 漸進擴充或 mapper |
| **Map Sync** | Map 頁、pins、geocode | N/A | 與 chat 產出 **marker 序號、選取捲動、路由預覽** 的產品級同步仍可強化 | **P1** | `/trip/[id]` 佈局、numbered markers、雙向聚焦 |
| **YouTube Timestamp Sources** | 影片分析、快取、來源正規化 | N/A | **型別與 UI 卡片**（timestamp 區間、segment）可更顯性 | **P1** | `YouTubeSourceCard` + service/connector 介面 |
| **Web Search** | 已有 `/api/search/web` | 多 search provider | Adapter（Mock / Serper / SearXNG）與 **`WebSearchResult` → `SourceReference`** 統一 | **P2** | `web-search-service.ts` + 無 key 時 mock |
| **RAG** | 無向量 chunk 表；memories API 存在 | 內部檢索 + vector | 無 embedding 管線與 chunk 儲存 | **P2** | 先 keyword + `source_chunks` 簡版，避免阻塞 P0 |
| **User Preference Memory** | Profile preferences JSON、memories API | N/A | 與 TODO **`UserTravelPreference`** 邊界（長期 vs 單次 trip）需理清 | **P3** | 集中 preference 服務 + UI 檢視/刪除 |
| **Artifacts Export** | 部分能力可能散落 | artifact export | Markdown/PDF/分享頁統一 | **P3** | `/api/trips/:id/export/*` 漸進 |

---

## 4. Recommended PR Plan

- **PR 1 — Grounded Chat Contract（對應 TODO §21）**  
  新增 P0 types（`SourceReference`、`ChatMessage` 延伸、`ItineraryPatch`、`ToolCallRecord`）；mock 多端嚴謹案例；**`SourceBadge` + `CitationList` 基礎版**；助理訊息底部接上 citations（沿用或擴充 `CitationGroup`）；**不**接真實 YouTube/Maps/Web 付費 API。

- **PR 2 — Source Hover / Drawer**  
  `SourceHoverCard`、`SourceDrawer`、`YouTubeSourceCard` 等；itinerary card 上 source badges；mobile / a11y。

- **PR 3 — Chat Orchestrator + Tool Status**  
  `chat-orchestrator` / `agent-orchestrator`、`tool-registry`、`ChatToolStatus`；API contract `POST /api/chat`（或漸進取代 `ai/chat`）；SSE 事件擴充。

- **PR 4 — Trip Page + Map Sync**  
  `/trip/[id]`、timeline + map、FAB、選取與 marker 雙向同步。

- **PR 5 — YouTube Analysis 強化**  
  Timestamp cards、segment → place、mock/real connector。

- **PR 6+**  
  Web search/crawl 統一、RAG、Export/Preferences（P2/P3）。

---

## 5. Risks

| 類型 | 說明 |
|------|------|
| **Technical** | 既有 `src/types/index.ts` 巨大檔與 TODO 建議目錄 split 需 **漸進** 以免大量 import 破壞；`chat/page.tsx` 已龐大，新 UI 宜 **抽元件** |
| **Product** | 過早導入 Onyx 式 corporate connector 會偏離旅遊核心 |
| **Cost** | Serper/Firecrawl 等需 **adapter + mock 預設** |
| **Security** | 來源預覽與分享頁不得洩漏 private URL；API key 僅伺服端 |
| **UX** | 必須涵蓋 loading / empty / error / permission / quota（TODO §0.1） |

---

## 6. Decisions Required

1. **型別目錄**：P0 types 放在 `aiyo/src/lib/types/` 與現有 `aiyo/src/types/index.ts` **並存**時，是否以 **re-export** 過渡，或逐步搬移？
2. **Chat API 單一路徑**：長期是否合併 `POST /api/ai/chat` 與規格中的 `POST /api/chat`，或保留相容 proxy？
3. **Prisma 擴充時機**：P0 是否僅 **應用層 JSON**（message metadata）先行，或 P1 即新增 `sources` / `message_citations` 表？

---

## 7. PR 1（Grounded Chat Contract）— 建議新增與修改檔案

> 路徑相對 **`aiyo/`**。實作時再開分支（例如 `feat/onyx-inspired-grounded-chat`）。

**建議新增**

- `src/lib/types/sources.ts` — `SourceType`、`SourceReference`
- `src/lib/types/chat.ts` — `ChatRole`、`ChatToolStatus`、延伸訊息 contract（與現有 `ChatMessage` 對齊或別名）
- `src/lib/types/itinerary.ts` — `Trip`/`ItineraryDay`/`ItineraryItem` contract、`ItineraryPatch`、`TravelPreferences`（與 Prisma 映射文件註解）
- `src/lib/types/tools.ts` — `ToolCallRecord`
- `src/mocks/groundedChatMock.ts`（或 `src/lib/mocks/*`）— **≥3 種 source** + **≥2 天、每天至少 3 items** 的 mock
- `src/components/sources/SourceBadge.tsx`
- `src/components/sources/CitationList.tsx`

**建議修改**

- `src/app/chat/page.tsx` 或抽出的訊息列元件 — 助理訊息底部挂上 `CitationList`（無 sources 不顯示）
- `src/components/chat/SourceTag.tsx` — 視情況 **改為內部實作或包一層 `SourceBadge`**（避免重複邏輯）
- 選擇性：`src/types/index.ts` — `export type { SourceReference } from "@/lib/types/sources"` 等 re-export

**不納入 PR 1**

- 真實 Web Search / YouTube API / Google Directions 全接
- 大規模 Prisma migration（除非用户明确要求）

---

## 8. 下一步

請 **產品/開發確認** 本報告「Decisions Required」後，再開始 **PR 1 實作**（依 TODO `§25`：本文件完成後等待使用者確認）。
