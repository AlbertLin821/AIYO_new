# TODO.md — AIYO_new 參照 Onyx 架構優化任務清單

> 目標讀者：Codex / AI coding agent  
> 主要專案：AIYO_new  
> 參考專案：`F:\Projects\Githubs\onyx`  
> 重要原則：Onyx 只能作為 read-only reference。不要修改 Onyx，不要把 AIYO_new 直接改成 Onyx，不要大量複製 Onyx 原始碼。  
> 產品方向：AIYO_new 是「AI 旅遊規劃 + YouTube 影片語意索引 + Google Maps 行程互動 + 可溯源 AI 回答」的平台。

---

## 0. 絕對限制與執行規則

### 0.1 必須遵守

- [ ] 不得修改 `F:\Projects\Githubs\onyx` 內任何檔案。
- [ ] 不得直接大量複製 Onyx 原始碼到 AIYO_new。
- [ ] 可以參考 Onyx 的設計模式、資料流、元件拆分、API 風格、工具調用模式、citation 顯示方式。
- [ ] 所有對 AIYO_new 的修改必須發生在 AIYO_new 專案內。
- [ ] 修改前必須先掃描 AIYO_new 現有架構，不得假設 AIYO_new 一定是 Next.js、FastAPI、Prisma、Drizzle 或其他特定技術。
- [ ] 若 AIYO_new 已有既有架構，優先延續既有架構；不要任意重構整個專案。
- [ ] 若需要新增環境變數，必須同步更新 `.env.example` 或專案內等價設定檔。
- [ ] 若需要資料庫 schema，必須提供 migration 或 schema 檔案，不得只改 TypeScript type。
- [ ] 若需要外部 API，例如 Google Maps、YouTube、Serper、Firecrawl，必須先做 adapter 介面與 mock/stub，不得硬編 API key。
- [ ] 所有 AI 回答若宣稱來自資料來源，必須有 `source_id` 或 `source_reference`，不得產生無來源的假 citation。
- [ ] 所有 UI 新增功能必須考慮 loading、empty、error、permission denied、API quota exceeded 五種狀態。
- [ ] 每一階段修改後必須執行專案既有的 lint/typecheck/test/build 指令；若專案沒有這些指令，需在報告中說明缺少。
- [ ] 不得把付費雲端 API 當成唯一可用實作。需要保留 local / mock / self-hosted 替代方案。
- [ ] 不得把 Onyx 的企業知識庫概念完整搬進 AIYO_new。AIYO_new 的資料核心是 `trip / day / itinerary_item / place / source / video_segment`。

### 0.2 建議工作方式

請按照以下順序執行：

1. 先掃描 AIYO_new 目前專案。
2. 再掃描 Onyx 參考專案。
3. 產出 architecture gap report。
4. 只做 P0 的第一個 PR。
5. 每個 PR 必須小範圍、可測試、可回滾。
6. 每完成一個階段，更新本 `TODO.md` checkbox 與新增 `IMPLEMENTATION_NOTES.md`。

### 0.3 分支命名建議

```bash
git checkout -b feat/onyx-inspired-grounded-chat
```

後續可依階段拆分：

```bash
feat/grounded-chat-contract
feat/source-citation-ui
feat/travel-agent-tools
feat/youtube-source-cards
feat/web-search-rag
feat/map-itinerary-sync
```

---

## 1. AIYO_new 產品定位

### 1.1 AIYO_new 不是什麼

AIYO_new 不是：

- 一般聊天機器人。
- 單純的 RAG 文件問答系統。
- Onyx 的 fork。
- 企業知識庫搜尋平台。
- 只有文字輸出的旅遊建議工具。
- 只靠 LLM 生成行程、不查資料、不顯示來源的 demo。

### 1.2 AIYO_new 是什麼

AIYO_new 是：

- AI 旅遊規劃平台。
- 能透過自然語言收集旅遊需求。
- 能將 YouTube 影片字幕、網頁、景點、地圖資訊轉換成可執行行程。
- 能用 Google Maps 顯示景點與路線。
- 能讓 AI 直接修改行程資料，而不是只輸出文字建議。
- 能顯示每個建議的資料來源，例如 YouTube timestamp、官方網站、Google Maps place、使用者上傳資料。
- 能讓使用者 hover / click source tag 預覽來源。
- 能將行程輸出成可分享頁面、Markdown、PDF 或其他 artifacts。

### 1.3 參照 Onyx 的目的

參考 Onyx 的重點：

- Chat UI 設計
- SSE / streaming response
- session persistence
- citation badges / source display
- agents：instructions + knowledge + actions
- tool calling / actions / MCP 思想
- web search + crawler
- internal search / RAG / hybrid retrieval
- connector 架構
- artifacts / downloadable results
- API key 與權限安全設計

不要參考或直接搬移：

- Onyx 完整企業權限模型
- Onyx 完整 admin panel
- Onyx 完整 connector 生態
- Onyx 完整部署架構
- Onyx 完整 UI 視覺風格
- Onyx 內部與 AIYO_new 旅遊產品無關的企業功能

---

## 2. 本地路徑與掃描準備

### 2.1 確認路徑

使用者提供的 Onyx 路徑：

```text
F:\Projects\Githubs\onyx
```

注意：不要使用尾端有空白的路徑：

```text
F:\Projects\Githubs\onyx 
```

Codex 需要先確認：

```powershell
Test-Path "F:\Projects\Githubs\onyx"
Test-Path "F:\Projects\Githubs\onyx\README.md"
```

### 2.2 掃描 AIYO_new

在 AIYO_new repo 根目錄執行：

```powershell
git status
Get-ChildItem
Get-ChildItem -Recurse -Depth 2 | Select-Object FullName
```

請辨識：

- 使用框架：Next.js / React / Vite / Vue / Svelte / Express / FastAPI / NestJS / Laravel / 其他
- 語言：TypeScript / JavaScript / Python / 其他
- 套件管理：npm / pnpm / yarn / bun / pip / poetry / uv / 其他
- 是否有資料庫 ORM：Prisma / Drizzle / SQLAlchemy / TypeORM / 其他
- 是否有現有 API routes
- 是否已有 chat 頁面
- 是否已有 trip / itinerary 頁面
- 是否已有 Google Maps
- 是否已有 YouTube 處理
- 是否已有 RAG / vector DB
- 是否已有 authentication
- 是否已有 user preference / memory
- 是否已有 tests

請產出：

```text
AIYO_new Project Scan Summary
- Framework:
- Package manager:
- Main frontend folder:
- Main backend folder:
- Existing chat files:
- Existing itinerary files:
- Existing map files:
- Existing database files:
- Existing env files:
- Existing test commands:
- Risks:
```

### 2.3 掃描 Onyx 參考專案

在 Onyx repo 執行下列搜尋。若 `rg` 不存在，請改用 VS Code search 或 PowerShell `Select-String`。

```powershell
cd "F:\Projects\Githubs\onyx"

rg -n "citation|citations|source document|source_documents|document title|include-citations" web backend widget
rg -n "SSE|EventSource|ReadableStream|stream|streaming|server-sent" web backend widget
rg -n "agent|persona|assistant|instruction|knowledge|actions|tool" web backend
rg -n "MCP|OpenAPI|tool_call|tool call|custom action|actions" web backend
rg -n "web search|Web Search|search provider|Serper|SearXNG|Firecrawl|Exa|crawler" web backend
rg -n "connector|LoadConnector|PollConnector|DocumentSource|indexing" backend
rg -n "session|chat session|message history|conversation" web backend widget
rg -n "artifact|artifacts|download|export" web backend
```

請只記錄可參考位置，不要直接複製實作。

輸出格式：

```text
Onyx Reference Scan Summary
- Chat UI reference:
- Streaming reference:
- Citation/source reference:
- Agent reference:
- Actions/tool reference:
- Web search/crawler reference:
- RAG/internal search reference:
- Connector reference:
- Widget reference:
- Artifact reference:
- Notes:
```

---

## 3. 必須先產出的 Architecture Gap Report

在進行任何程式修改前，必須先建立或更新：

```text
docs/AIYO_ONYX_GAP_REPORT.md
```

如果 `docs/` 不存在，請建立。

內容格式如下：

```markdown
# AIYO_new x Onyx Architecture Gap Report

## 1. Current AIYO_new Architecture
- Framework:
- Frontend:
- Backend:
- Database:
- AI provider:
- Maps:
- YouTube:
- Search:
- Deployment:
- Test commands:

## 2. Onyx Reference Architecture
- Chat:
- Streaming:
- Citations:
- Agents:
- Actions:
- Web Search:
- RAG:
- Connectors:
- Widget:
- Artifacts:

## 3. Gap Table

| Area | AIYO_new Current | Onyx Reference | Gap | Priority | Proposed Fix |
|---|---|---|---|---|---|
| Chat UI | | | | P0 | |
| Streaming | | | | P0 | |
| Source Citation | | | | P0 | |
| Travel Agent | | | | P0 | |
| Tool Calling | | | | P0 | |
| Itinerary Data Model | | | | P0 | |
| Map Sync | | | | P1 | |
| YouTube Timestamp Sources | | | | P1 | |
| Web Search | | | | P2 | |
| RAG | | | | P2 | |
| User Preference Memory | | | | P3 | |
| Artifacts Export | | | | P3 | |

## 4. Recommended PR Plan
- PR 1:
- PR 2:
- PR 3:
- PR 4:
- PR 5:

## 5. Risks
- Technical:
- Product:
- Cost:
- Security:
- UX:

## 6. Decisions Required
- Decision 1:
- Decision 2:
```

---

## 4. 最終目標架構

### 4.1 建議目錄架構

Codex 必須依照 AIYO_new 既有框架調整。若 AIYO_new 是 Next.js / React 類型，可參考以下結構：

```text
src/
├─ app/
│  ├─ chat/
│  ├─ trip/[id]/
│  └─ api/
│     ├─ chat/
│     ├─ trips/
│     ├─ sources/
│     ├─ search/
│     ├─ youtube/
│     └─ maps/
├─ components/
│  ├─ chat/
│  │  ├─ ChatPanel.tsx
│  │  ├─ ChatMessageBubble.tsx
│  │  ├─ ChatInput.tsx
│  │  ├─ ChatToolStatus.tsx
│  │  ├─ ChatFab.tsx
│  │  └─ StreamingMessage.tsx
│  ├─ sources/
│  │  ├─ SourceBadge.tsx
│  │  ├─ SourceHoverCard.tsx
│  │  ├─ SourceDrawer.tsx
│  │  ├─ CitationList.tsx
│  │  ├─ YouTubeSourceCard.tsx
│  │  ├─ WebsiteSourceCard.tsx
│  │  └─ MapPlaceSourceCard.tsx
│  ├─ itinerary/
│  │  ├─ ItineraryTimeline.tsx
│  │  ├─ ItineraryDaySection.tsx
│  │  ├─ ItineraryItemCard.tsx
│  │  ├─ ItineraryEditControls.tsx
│  │  └─ TripSummaryPanel.tsx
│  └─ map/
│     ├─ TravelMap.tsx
│     ├─ NumberedMapMarker.tsx
│     ├─ RoutePreview.tsx
│     └─ MapPlacePreview.tsx
├─ lib/
│  ├─ ai/
│  │  ├─ chat-orchestrator.ts
│  │  ├─ agent-orchestrator.ts
│  │  ├─ model-client.ts
│  │  ├─ prompts.ts
│  │  └─ streaming.ts
│  ├─ agents/
│  │  ├─ travel-planner-agent.ts
│  │  ├─ itinerary-editor-agent.ts
│  │  ├─ video-understanding-agent.ts
│  │  ├─ place-research-agent.ts
│  │  └─ source-grounding-agent.ts
│  ├─ tools/
│  │  ├─ tool-registry.ts
│  │  ├─ create-trip.ts
│  │  ├─ update-itinerary.ts
│  │  ├─ search-places.ts
│  │  ├─ calculate-route.ts
│  │  ├─ get-youtube-transcript.ts
│  │  ├─ extract-video-segments.ts
│  │  └─ attach-source.ts
│  ├─ services/
│  │  ├─ itinerary-service.ts
│  │  ├─ source-citation-service.ts
│  │  ├─ web-search-service.ts
│  │  ├─ youtube-service.ts
│  │  ├─ maps-service.ts
│  │  ├─ retrieval-service.ts
│  │  └─ user-preference-service.ts
│  ├─ connectors/
│  │  ├─ youtube-connector.ts
│  │  ├─ webpage-connector.ts
│  │  ├─ google-maps-connector.ts
│  │  └─ user-upload-connector.ts
│  ├─ types/
│  │  ├─ chat.ts
│  │  ├─ sources.ts
│  │  ├─ itinerary.ts
│  │  ├─ agents.ts
│  │  └─ tools.ts
│  └─ db/
│     ├─ schema.ts
│     ├─ migrations/
│     └─ repositories/
└─ tests/
   ├─ unit/
   ├─ integration/
   └─ e2e/
```

如果 AIYO_new 是前後端分離，例如 `frontend/` + `backend/`，請把上述模組拆到對應專案，不要硬套 `src/app`。

---

## 5. P0 — Grounded Chat Contract 與核心資料模型

### 5.1 目的

建立後續所有功能的共同資料格式。這一階段先不需要真的接 Web Search、Google Maps、YouTube API，可以先用 mock data。重點是資料 contract 必須穩定。

### 5.2 新增 TypeScript types

建立或更新：

```text
src/lib/types/sources.ts
src/lib/types/chat.ts
src/lib/types/itinerary.ts
src/lib/types/tools.ts
```

若專案不是 TypeScript，請改成等價的 Python Pydantic model、JSON schema 或後端 DTO。

#### `SourceReference`

```ts
export type SourceType =
  | "youtube"
  | "website"
  | "google_place"
  | "user_upload"
  | "system"
  | "unknown";

export type SourceReference = {
  id: string;
  type: SourceType;
  title: string;
  url?: string;
  snippet?: string;
  thumbnailUrl?: string;
  provider?: string;
  retrievedAt?: string;
  confidence?: number;

  youtube?: {
    videoId: string;
    channelTitle?: string;
    startSeconds?: number;
    endSeconds?: number;
    timestampLabel?: string;
    transcriptText?: string;
  };

  website?: {
    siteName?: string;
    publishedAt?: string;
    author?: string;
    canonicalUrl?: string;
  };

  googlePlace?: {
    placeId: string;
    name: string;
    address?: string;
    rating?: number;
    userRatingCount?: number;
    lat?: number;
    lng?: number;
  };

  userUpload?: {
    fileId: string;
    fileName: string;
    pageNumber?: number;
    chunkIndex?: number;
  };
};
```

#### `ChatMessage`

```ts
export type ChatRole = "user" | "assistant" | "system" | "tool";

export type ChatToolStatus =
  | "idle"
  | "planning"
  | "searching_web"
  | "reading_youtube"
  | "searching_places"
  | "calculating_route"
  | "updating_itinerary"
  | "grounding_sources"
  | "done"
  | "error";

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
  sources?: SourceReference[];
  toolCalls?: ToolCallRecord[];
  itineraryPatch?: ItineraryPatch;
  metadata?: Record<string, unknown>;
};
```

#### `Itinerary`

```ts
export type Trip = {
  id: string;
  title: string;
  destination: string;
  origin?: string;
  startDate?: string;
  endDate?: string;
  days: ItineraryDay[];
  preferences?: TravelPreferences;
  sources?: SourceReference[];
  createdAt: string;
  updatedAt: string;
};

export type TravelPreferences = {
  durationDays?: number;
  budgetLevel?: "low" | "medium" | "high" | "luxury";
  pace?: "relaxed" | "balanced" | "packed";
  companions?: Array<"solo" | "couple" | "friends" | "family" | "elderly" | "children">;
  interests?: string[];
  avoidances?: string[];
  visitedBefore?: string[];
  language?: "zh-TW" | "en" | "ja" | "mixed";
};

export type ItineraryDay = {
  id: string;
  dayIndex: number;
  title: string;
  date?: string;
  summary?: string;
  items: ItineraryItem[];
};

export type ItineraryItem = {
  id: string;
  dayId: string;
  orderIndex: number;
  startTime?: string;
  endTime?: string;
  title: string;
  description?: string;
  itemType: "place" | "meal" | "transport" | "activity" | "hotel" | "free_time";
  place?: TravelPlace;
  estimatedCost?: number;
  durationMinutes?: number;
  sourceIds?: string[];
  notes?: string;
};

export type TravelPlace = {
  id: string;
  name: string;
  address?: string;
  lat?: number;
  lng?: number;
  googlePlaceId?: string;
  rating?: number;
  imageUrl?: string;
  tags?: string[];
};

export type ItineraryPatch = {
  operation:
    | "create_trip"
    | "update_trip"
    | "add_item"
    | "remove_item"
    | "move_item"
    | "replace_item"
    | "update_item"
    | "reorder_day";
  tripId?: string;
  dayId?: string;
  itemId?: string;
  payload: Record<string, unknown>;
};
```

#### `ToolCallRecord`

```ts
export type ToolCallRecord = {
  id: string;
  toolName: string;
  status: "pending" | "running" | "success" | "error";
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  errorMessage?: string;
  startedAt?: string;
  endedAt?: string;
};
```

### 5.3 驗收標準

- [ ] 專案可以 import 以上 types / models。
- [ ] 既有 chat 頁面不壞。
- [ ] 新增 mock assistant response，包含至少 3 種 source：
  - YouTube source
  - Website source
  - Google Maps place source
- [ ] 新增 mock itinerary，包含至少 2 天，每天至少 3 個 items。
- [ ] 所有 source 都有唯一 id。
- [ ] itinerary item 可以透過 `sourceIds` 關聯到 sources。
- [ ] lint/typecheck/build 通過。

---

## 6. P0 — Source Citation UI

### 6.1 目的

參照 Onyx 的 citation badges 概念，但改造成 AIYO_new 的旅遊來源顯示。

### 6.2 新增元件

#### `SourceBadge`

檔案建議：

```text
src/components/sources/SourceBadge.tsx
```

功能：

- [ ] 顯示來源類型 icon 或文字：
  - YouTube
  - Web
  - Map
  - Upload
- [ ] 顯示簡短 label，例如：
  - `YouTube 03:21`
  - `Official Site`
  - `Google Maps`
  - `Uploaded PDF p.3`
- [ ] 支援 hover 開啟 `SourceHoverCard`。
- [ ] 支援 click 開啟 `SourceDrawer` 或 external URL。
- [ ] 若 source 缺少必要欄位，顯示 fallback，不得 crash。
- [ ] 對鍵盤可用：tab focus、Enter 開啟、Esc 關閉。

#### `SourceHoverCard`

檔案建議：

```text
src/components/sources/SourceHoverCard.tsx
```

功能：

- [ ] 顯示 title。
- [ ] 顯示 snippet。
- [ ] 顯示 type-specific metadata：
  - YouTube：thumbnail、timestamp、channel、transcript snippet
  - Website：site name、published date、canonical URL
  - Google Place：address、rating、place name
  - Upload：file name、page、chunk
- [ ] loading state。
- [ ] empty state。
- [ ] error state。
- [ ] 不要在 hover card 中暴露 private key 或 internal path。

#### `CitationList`

檔案建議：

```text
src/components/sources/CitationList.tsx
```

功能：

- [ ] 接收 `sources: SourceReference[]`。
- [ ] 按來源類型分組或保留順序。
- [ ] 每個來源 render `SourceBadge`。
- [ ] 去重：相同 `source.id` 只顯示一次。
- [ ] 支援最多顯示 N 個，超過顯示 `+3 more`。

#### `SourceDrawer`

檔案建議：

```text
src/components/sources/SourceDrawer.tsx
```

功能：

- [ ] 點擊來源後顯示完整預覽。
- [ ] 顯示來源原始 URL。
- [ ] 顯示引用段落或 transcript segment。
- [ ] 顯示相關 itinerary items。
- [ ] 允許「在新分頁開啟來源」。
- [ ] 若來源是 YouTube，提供 timestamp link。
- [ ] 若來源是 Google Place，提供 Google Maps link 或 place preview。

### 6.3 修改 Chat Message UI

找到既有 chat message bubble，新增：

- [ ] assistant message 底部顯示 `CitationList`。
- [ ] 若 message 沒有 sources，不顯示 citation 區域。
- [ ] 若 message 有 source id 但缺 source object，顯示 warning fallback。
- [ ] 不允許模型自己在文字中用 `[1]` 假裝引用，必須使用 structured sources。

### 6.4 修改 Itinerary Item UI

每個行程卡片新增：

- [ ] item title。
- [ ] item description。
- [ ] source badges。
- [ ] Google Maps button。
- [ ] Ask AI to adjust button。
- [ ] hover / selected state。

### 6.5 驗收標準

- [ ] mock AI 回答底部能看到來源 badges。
- [ ] hover YouTube badge 看到 timestamp preview。
- [ ] hover Website badge 看到 title/snippet/url。
- [ ] hover Google Maps badge 看到 place/address/rating。
- [ ] click source 可開 drawer 或 external link。
- [ ] 無 sources 時畫面不崩潰。
- [ ] keyboard navigation 可用。
- [ ] mobile 不破版。

---

## 7. P0 — Chat Orchestrator 與 Tool Status

### 7.1 目的

把 chat 從「單純送 prompt 給模型」改成「可選 Agent、可調工具、可回傳來源、可修改行程」的 orchestrated flow。

### 7.2 後端核心模組

建立或更新：

```text
src/lib/ai/chat-orchestrator.ts
src/lib/ai/agent-orchestrator.ts
src/lib/tools/tool-registry.ts
src/lib/services/source-citation-service.ts
src/lib/services/itinerary-service.ts
```

若 AIYO_new 是 Python 後端，對應建立：

```text
backend/app/ai/chat_orchestrator.py
backend/app/ai/agent_orchestrator.py
backend/app/tools/tool_registry.py
backend/app/services/source_citation_service.py
backend/app/services/itinerary_service.py
```

### 7.3 Chat Orchestrator 流程

必須支援以下流程：

```text
User message
↓
Normalize input
↓
Load current trip/session context
↓
Detect intent
↓
Select agent
↓
Plan required tools
↓
Execute allowed tools
↓
Generate grounded response
↓
Validate sources
↓
Apply itinerary patch if user approved or action is safe
↓
Return streaming response + structured metadata
```

### 7.4 Intent Detection

至少支援：

```ts
export type TravelIntent =
  | "collect_requirements"
  | "create_itinerary"
  | "edit_itinerary"
  | "search_place"
  | "analyze_youtube"
  | "ask_about_source"
  | "general_travel_question"
  | "unknown";
```

### 7.5 Tool Status UI

新增：

```text
src/components/chat/ChatToolStatus.tsx
```

支援狀態：

- [ ] 正在理解需求
- [ ] 正在搜尋景點
- [ ] 正在讀取 YouTube 字幕
- [ ] 正在查詢網頁資料
- [ ] 正在計算路線
- [ ] 正在修改行程
- [ ] 正在附加資料來源
- [ ] 完成
- [ ] 發生錯誤

### 7.6 API Contract

如果是 Next.js API route：

```text
POST /api/chat
```

Request：

```json
{
  "sessionId": "string",
  "tripId": "string | null",
  "message": "string",
  "context": {
    "currentPage": "/chat | /trip/[id]",
    "selectedDayId": "string | null",
    "selectedItemId": "string | null"
  },
  "options": {
    "stream": true,
    "allowTools": true,
    "allowItineraryMutation": false
  }
}
```

Response 非 streaming fallback：

```json
{
  "message": {
    "id": "assistant-message-id",
    "role": "assistant",
    "content": "string",
    "sources": [],
    "toolCalls": [],
    "itineraryPatch": null,
    "createdAt": "ISO string"
  },
  "trip": null,
  "warnings": []
}
```

Streaming event 建議：

```text
event: status
data: {"status":"searching_places","label":"正在搜尋景點..."}

event: token
data: {"delta":"熊本"}

event: tool_call
data: {"toolName":"search_places","status":"running"}

event: source
data: {"source":{...}}

event: itinerary_patch
data: {"patch":{...}}

event: done
data: {"messageId":"..."}
```

### 7.7 驗收標準

- [ ] 使用者輸入「我想去熊本五天四夜」時，系統不要直接亂產完整行程；應先判斷缺少需求。
- [ ] 若缺少必要資訊，AI 追問：
  - 出發地
  - 預算
  - 旅遊步調
  - 同行者
  - 喜好
  - 是否有老人小孩
  - 是否有已去過景點
- [ ] 若資訊足夠，AI 可以產生 trip draft。
- [ ] API response 包含 structured message。
- [ ] 前端能顯示 tool status。
- [ ] streaming 不支援時有 fallback。
- [ ] 錯誤時顯示友善訊息。

---

## 8. P0 — Agent 設計

### 8.1 目的

參考 Onyx「Agents = instructions + knowledge + actions」概念，將 AIYO_new 拆成旅遊專用 Agents。

### 8.2 Agent 清單

#### `TravelPlannerAgent`

職責：

- 收集旅遊需求。
- 建立初版行程。
- 根據使用者偏好規劃天數與節奏。
- 必須要求來源支持重要建議。

可用工具：

- `createTrip`
- `searchPlaces`
- `attachSource`
- `getPlaceDetails`
- `estimateTravelTime`

#### `ItineraryEditorAgent`

職責：

- 修改既有行程。
- 移動、刪除、替換、重新排序景點。
- 根據地圖距離與使用者偏好調整。

可用工具：

- `updateItinerary`
- `moveItineraryItem`
- `replaceItineraryItem`
- `removeItineraryItem`
- `calculateRoute`

#### `VideoUnderstandingAgent`

職責：

- 讀取 YouTube transcript。
- 分段摘要。
- 抽取景點、餐廳、路線、活動、注意事項。
- 將每個片段轉成 source reference。

可用工具：

- `getYouTubeTranscript`
- `extractVideoSegments`
- `createYouTubeSource`
- `linkSourceToPlace`

#### `PlaceResearchAgent`

職責：

- 查詢景點、營業時間、交通、評分、注意事項。
- 比較不同景點的適合程度。

可用工具：

- `searchWeb`
- `crawlUrl`
- `searchPlaces`
- `getPlaceDetails`

#### `SourceGroundingAgent`

職責：

- 檢查 AI 回答中的 claims 是否有來源。
- 附加 citations。
- 移除無根據的具體宣稱。

可用工具：

- `retrieveSources`
- `attachSource`
- `validateCitation`

### 8.3 Agent Config

建立：

```text
src/lib/agents/agent-config.ts
```

建議格式：

```ts
export type AgentConfig = {
  id: string;
  name: string;
  description: string;
  instructions: string;
  allowedTools: string[];
  requiresSources: boolean;
  canMutateItinerary: boolean;
};

export const AGENTS: AgentConfig[] = [
  {
    id: "travel-planner",
    name: "Travel Planner Agent",
    description: "Collects requirements and creates grounded travel itineraries.",
    instructions: "...",
    allowedTools: ["createTrip", "searchPlaces", "attachSource"],
    requiresSources: true,
    canMutateItinerary: true
  }
];
```

### 8.4 Agent Prompt 原則

所有 agent 必須遵守：

- [ ] 不可捏造景點營業時間、票價、交通時間。
- [ ] 不可把未查證資料說成確定事實。
- [ ] 若缺少資料，必須說明需要查詢或請使用者補充。
- [ ] 建議行程時必須輸出 structured itinerary patch。
- [ ] 重要景點推薦必須綁定 source。
- [ ] 旅遊規劃語氣：清楚、實用、商業旅遊平台風格。
- [ ] UI 回答語言預設繁體中文。
- [ ] 可保留景點名稱原文，例如日文地名或英文地名。

---

## 9. P0 — Tool Registry 與 Tool Calling

### 9.1 目的

AI 必須能「真的操作系統資料」，而不是只生成文字。這是 AIYO_new 與普通 Chatbot 的差異。

### 9.2 Tool Registry

建立：

```text
src/lib/tools/tool-registry.ts
```

範例格式：

```ts
export type ToolDefinition<Input = unknown, Output = unknown> = {
  name: string;
  description: string;
  inputSchema: unknown;
  outputSchema: unknown;
  execute: (input: Input, context: ToolExecutionContext) => Promise<Output>;
  safeToAutoRun: boolean;
  requiresUserApproval: boolean;
};

export type ToolExecutionContext = {
  userId?: string;
  sessionId: string;
  tripId?: string;
  agentId: string;
};
```

### 9.3 必要工具

#### `createTrip`

- [ ] 建立 trip draft。
- [ ] 接收 destination、durationDays、preferences。
- [ ] 回傳 trip object。
- [ ] 不得直接產生無 source 的確定性推薦。

#### `updateTripPreference`

- [ ] 更新偏好。
- [ ] 儲存同行者、預算、步調、喜好、避開項目。

#### `addItineraryItem`

- [ ] 新增一個行程項目。
- [ ] 必須指定 dayId。
- [ ] 必須處理 orderIndex。
- [ ] 可附 sourceIds。

#### `removeItineraryItem`

- [ ] 移除行程項目。
- [ ] 預設需要使用者確認。
- [ ] 不得 silent delete。

#### `moveItineraryItem`

- [ ] 調整 day 或順序。
- [ ] 必須維持 orderIndex 連續。
- [ ] 地圖 marker 順序需要同步更新。

#### `replaceItineraryItem`

- [ ] 用新景點替換舊景點。
- [ ] 必須保留替換原因。
- [ ] 必須提供 source。

#### `searchPlaces`

- [ ] 支援 query、destination、category、location bias。
- [ ] 初期可用 mock。
- [ ] 後期接 Google Places API 或其他 provider。
- [ ] 不得硬編 key。

#### `getPlaceDetails`

- [ ] 用 placeId 查詳細資料。
- [ ] 初期可用 mock。
- [ ] 後期支援地址、經緯度、評分、營業資訊。

#### `calculateRoute`

- [ ] 計算兩點或多點距離與時間。
- [ ] 初期可用直線距離/mock。
- [ ] 後期接 Google Directions API。
- [ ] 不得讓 LLM 猜測精確交通時間。

#### `getYouTubeTranscript`

- [ ] 接收 video URL。
- [ ] 回傳 transcript segments。
- [ ] 初期可 mock。
- [ ] 需處理沒有字幕、私人影片、年齡限制、地區限制。

#### `extractVideoSegments`

- [ ] 從 transcript 抽取 segments。
- [ ] 每段要有 startSeconds、endSeconds、summary、mentionedPlaces。
- [ ] 每段產生 SourceReference。

#### `attachSource`

- [ ] 把 source 綁到 message 或 itinerary item。
- [ ] 必須檢查 source 是否存在。
- [ ] 不得允許不存在的 source id。

### 9.4 Tool 執行安全規則

- [ ] 查詢類工具可自動執行。
- [ ] 建立 trip draft 可自動執行。
- [ ] 修改行程可自動產生 patch，但是否直接 apply 由 `allowItineraryMutation` 決定。
- [ ] 刪除行程 item 預設需要使用者確認。
- [ ] 批次改動超過 3 個 item 需要使用者確認。
- [ ] 對外 API 失敗時要 fallback 到 mock/error，不得整個 chat crash。

---

## 10. P1 — 行程頁與 Google Map 同步

### 10.1 目的

讓 AIYO_new 的產品核心從聊天轉成互動式旅遊行程。

### 10.2 `/trip/[id]` Layout

建議：

```text
┌────────────────────────────────────────────────────┐
│ Header: Trip title / destination / share / export  │
├───────────────────────┬────────────────────────────┤
│ Left: Itinerary       │ Right: Google Map           │
│ - Day tabs            │ - Numbered markers          │
│ - Timeline cards      │ - Selected marker highlight │
│ - Source badges       │ - Route preview             │
│ - AI adjust buttons   │                            │
├───────────────────────┴────────────────────────────┤
│ Bottom center: AI Chat FAB                          │
└────────────────────────────────────────────────────┘
```

### 10.3 Marker Sync

必須實作：

- [ ] itinerary item 有經緯度時顯示 marker。
- [ ] marker number = 該日順序。
- [ ] 點左側行程卡，右側 marker 高亮。
- [ ] 點右側 marker，左側卡片 scroll into view。
- [ ] AI 修改順序後，marker number 重新計算。
- [ ] 沒有經緯度的 item 不顯示 marker，但 UI 顯示「缺少地點資料」。
- [ ] 地圖 loading/error state。
- [ ] API key 缺失時顯示 placeholder，不要 crash。

### 10.4 Itinerary Card

每張卡片必須包含：

- [ ] 時間或順序。
- [ ] 地點/活動名稱。
- [ ] 類型：景點、餐廳、交通、飯店、自由時間。
- [ ] 簡短說明。
- [ ] 預估停留時間。
- [ ] source badges。
- [ ] AI 調整按鈕。
- [ ] Google Maps 開啟按鈕。
- [ ] selected/highlight state。
- [ ] drag/reorder 可以後續做，初期可先不做。

---

## 11. P1 — YouTube Timestamp Source Cards

### 11.1 目的

強化 AIYO_new 最大差異化：從旅遊影片轉換為行程。

### 11.2 UI 元件

建立：

```text
src/components/sources/YouTubeSourceCard.tsx
```

功能：

- [ ] 顯示影片 thumbnail。
- [ ] 顯示影片標題。
- [ ] 顯示 channel。
- [ ] 顯示 timestamp，例如 `03:21 - 04:10`。
- [ ] 顯示 segment summary。
- [ ] 顯示 extracted places。
- [ ] 點擊可開啟 YouTube timestamp URL。
- [ ] 若 transcript 不存在，顯示 unavailable 狀態。

### 11.3 YouTube Service

建立：

```text
src/lib/services/youtube-service.ts
src/lib/connectors/youtube-connector.ts
```

功能：

- [ ] parse video id。
- [ ] fetch transcript。
- [ ] normalize transcript segments。
- [ ] extract places。
- [ ] generate source references。
- [ ] cache result。
- [ ] error handling。

### 11.4 影片轉行程流程

```text
User submits YouTube URL
↓
getYouTubeTranscript
↓
extractVideoSegments
↓
detect mentioned places
↓
searchPlaces / getPlaceDetails
↓
create source references
↓
create itinerary suggestions
↓
show YouTube source cards
```

### 11.5 驗收標準

- [ ] 使用 mock YouTube transcript 可產生 segments。
- [ ] 每個 segment 有 timestamp。
- [ ] 每個建議景點至少能追溯到某個 segment。
- [ ] UI 顯示 YouTube cards。
- [ ] 點擊 timestamp 開啟正確 YouTube URL。

---

## 12. P2 — Web Search / Crawler / Grounding

### 12.1 目的

讓 AIYO_new 查詢最新旅遊資訊，而不是只靠 LLM 記憶。

### 12.2 Web Search Service

建立：

```text
src/lib/services/web-search-service.ts
src/lib/connectors/webpage-connector.ts
```

介面：

```ts
export type WebSearchInput = {
  query: string;
  locale?: string;
  destination?: string;
  maxResults?: number;
};

export type WebSearchResult = {
  title: string;
  url: string;
  snippet: string;
  provider: string;
  retrievedAt: string;
};
```

### 12.3 Provider Adapter

至少保留：

- [ ] MockSearchProvider
- [ ] SearXNGSearchProvider
- [ ] SerperSearchProvider
- [ ] GooglePSESearchProvider
- [ ] FirecrawlCrawlerProvider 或 WebCrawlerProvider

初期優先 Mock + interface，不要強制接付費服務。

### 12.4 Crawl Result

```ts
export type CrawledPage = {
  url: string;
  title?: string;
  markdown: string;
  text: string;
  metadata?: Record<string, unknown>;
  retrievedAt: string;
};
```

### 12.5 Travel Fact Extraction

從網頁內容抽取：

- [ ] 景點名稱
- [ ] 地址
- [ ] 交通資訊
- [ ] 營業時間
- [ ] 票價
- [ ] 預約資訊
- [ ] 注意事項
- [ ] 適合族群
- [ ] 最佳參觀時間
- [ ] source id

### 12.6 驗收標準

- [ ] 可輸入「熊本城 營業時間」取得 search results。
- [ ] 可 crawl 一個 URL 並取得 clean text。
- [ ] 可建立 website SourceReference。
- [ ] AI 回答可引用 website source。
- [ ] provider 失敗時回傳可理解錯誤。
- [ ] 沒有 API key 時用 mock 或提示設定，不得 crash。

---

## 13. P2 — RAG / Retrieval

### 13.1 目的

讓 YouTube transcript、網頁資料、使用者上傳資料、景點資料可以被檢索與引用。

### 13.2 資料模型

若使用 PostgreSQL + vector extension，可考慮：

```sql
CREATE TABLE sources (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT,
  provider TEXT,
  metadata JSONB,
  retrieved_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

CREATE TABLE source_chunks (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  metadata JSONB,
  embedding VECTOR,
  created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE message_citations (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL,
  source_id TEXT NOT NULL REFERENCES sources(id),
  source_chunk_id TEXT REFERENCES source_chunks(id),
  quote TEXT,
  confidence REAL,
  created_at TIMESTAMP DEFAULT now()
);
```

若目前專案沒有 vector DB，先建立純文字 chunks + keyword search，不要一次上太複雜。

### 13.3 Retrieval Service

建立：

```text
src/lib/services/retrieval-service.ts
```

功能：

- [ ] save source。
- [ ] chunk source content。
- [ ] embed chunks。
- [ ] keyword search。
- [ ] vector search。
- [ ] hybrid search。
- [ ] rerank。
- [ ] return source references。
- [ ] dedupe sources。

### 13.4 初期可接受簡化版

P2 初期可先做：

- sources table
- source_chunks table
- simple keyword search
- mock embeddings
- future TODO for vector DB

不要讓 RAG 重構阻塞 P0/P1。

---

## 14. P3 — User Preference Memory

### 14.1 目的

讓 AIYO_new 能越用越個人化，但不得過早複雜化。

### 14.2 Preference Data

```ts
export type UserTravelPreference = {
  userId: string;
  preferredPace?: "relaxed" | "balanced" | "packed";
  budgetLevel?: "low" | "medium" | "high" | "luxury";
  interests?: string[];
  avoidances?: string[];
  preferredTransport?: string[];
  dietaryRestrictions?: string[];
  accessibilityNeeds?: string[];
  preferredLanguage?: "zh-TW" | "en" | "ja" | "mixed";
  updatedAt: string;
};
```

### 14.3 規則

- [ ] 不要自動保存敏感資訊。
- [ ] 不要保存短期資訊，例如「這次想吃拉麵」除非屬於該 trip。
- [ ] 可保存長期偏好，例如「喜歡慢步調」「偏好自然景點」。
- [ ] UI 必須允許使用者查看、修改、刪除偏好。
- [ ] 未登入使用者只能保存 session-level preference。

---

## 15. P3 — Artifacts / Export

### 15.1 目的

讓 AIYO_new 可以輸出實用成果，強化比賽展示與商業化價值。

### 15.2 Export Types

- [ ] Markdown 行程表。
- [ ] PDF 行程表。
- [ ] 可分享 trip page。
- [ ] Google Maps 景點清單。
- [ ] YouTube 影片重點摘要。
- [ ] 每日行程卡片圖片。

### 15.3 建議 API

```text
POST /api/trips/:id/export/markdown
POST /api/trips/:id/export/pdf
POST /api/trips/:id/share
```

### 15.4 驗收標準

- [ ] 匯出的行程包含日期、景點、時間、交通、source。
- [ ] 不把 private source URL 洩漏給公開分享頁。
- [ ] 分享頁可以關閉或重新產生 link。

---

## 16. API 路由 TODO

Codex 需要依據目前專案框架建立或調整 API。以下是目標能力，不代表必須使用完全相同路徑。

### 16.1 Chat

```text
POST /api/chat
```

- [ ] 接收使用者訊息。
- [ ] 支援 sessionId。
- [ ] 支援 tripId。
- [ ] 支援 stream。
- [ ] 回傳 structured message。
- [ ] 回傳 sources。
- [ ] 回傳 toolCalls。
- [ ] 回傳 itineraryPatch。

### 16.2 Trips

```text
GET /api/trips
POST /api/trips
GET /api/trips/:id
PATCH /api/trips/:id
DELETE /api/trips/:id
```

### 16.3 Itinerary Items

```text
POST /api/trips/:id/items
PATCH /api/trips/:id/items/:itemId
DELETE /api/trips/:id/items/:itemId
POST /api/trips/:id/items/:itemId/move
```

### 16.4 Sources

```text
GET /api/sources/:id
POST /api/sources
GET /api/messages/:messageId/sources
```

### 16.5 YouTube

```text
POST /api/youtube/transcript
POST /api/youtube/analyze
```

### 16.6 Search

```text
POST /api/search/web
POST /api/search/crawl
POST /api/search/places
```

### 16.7 Maps

```text
POST /api/maps/place-details
POST /api/maps/route
```

---

## 17. Database TODO

Codex 需要先確認目前使用的 DB/ORM，再選擇對應方式。

### 17.1 必要資料表概念

- [ ] users 或 session users
- [ ] chat_sessions
- [ ] chat_messages
- [ ] trips
- [ ] itinerary_days
- [ ] itinerary_items
- [ ] places
- [ ] sources
- [ ] source_chunks
- [ ] message_citations
- [ ] item_sources
- [ ] tool_call_logs
- [ ] user_travel_preferences

### 17.2 最小可行 schema

若不想一次新增太多，P0 至少需要：

- [ ] trips
- [ ] itinerary_days
- [ ] itinerary_items
- [ ] sources
- [ ] chat_sessions
- [ ] chat_messages

### 17.3 關聯規則

- [ ] 一個 trip 有多個 itinerary_days。
- [ ] 一個 day 有多個 itinerary_items。
- [ ] 一個 item 可以有多個 sources。
- [ ] 一個 message 可以有多個 sources。
- [ ] 一個 source 可以對應多個 chunks。
- [ ] tool call log 必須可追蹤 message/session/trip。

---

## 18. UI/UX TODO

### 18.1 `/chat`

- [ ] 將 `/chat` 定位成「需求收集 + 初步規劃」頁。
- [ ] 顯示目前已收集需求。
- [ ] 缺少資訊時，AI 用問題卡片追問。
- [ ] 可顯示 trip draft preview。
- [ ] 可一鍵建立正式 trip。
- [ ] AI 回答顯示 citations。
- [ ] 顯示 tool status。

### 18.2 `/trip/[id]`

- [ ] 左側 itinerary timeline。
- [ ] 右側 Google Map。
- [ ] 底部中央 AI Chat FAB。
- [ ] source drawer。
- [ ] day tabs。
- [ ] selected item sync。
- [ ] map marker sync。
- [ ] AI 修改 itinerary 後自動 refresh UI。

### 18.3 AI Chat FAB

- [ ] 預設收合。
- [ ] 點擊展開。
- [ ] 支援 glassmorphism 風格。
- [ ] 支援淡入滑出動畫。
- [ ] 支援 mobile fullscreen。
- [ ] 保留 session。
- [ ] 可以讀取目前 trip context。
- [ ] 可以針對目前選取 item 提問。

### 18.4 Source Display

- [ ] 每則 AI assistant message 底部顯示 citations。
- [ ] 每張 itinerary item card 顯示 source badges。
- [ ] hover 顯示 preview。
- [ ] click 顯示 drawer。
- [ ] 顯示 YouTube timestamp。
- [ ] 顯示 website title/snippet。
- [ ] 顯示 Google Place address/rating。

---

## 19. LLM / Ollama TODO

### 19.1 Model Client

建立統一 model client，不要在各 API route 直接寫死 Ollama/OpenAI。

```text
src/lib/ai/model-client.ts
```

支援：

- [ ] Ollama local。
- [ ] OpenAI-compatible endpoint。
- [ ] Streaming。
- [ ] JSON mode 或 structured output fallback。
- [ ] timeout。
- [ ] retry。
- [ ] error mapping。

### 19.2 環境變數

`.env.example` 建議：

```env
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_CHAT_MODEL=qwen3.6:27b
OLLAMA_EMBED_MODEL=nomic-embed-text:latest

GOOGLE_MAPS_API_KEY=
YOUTUBE_API_KEY=
SEARCH_PROVIDER=mock
SERPER_API_KEY=
SEARXNG_BASE_URL=
FIRECRAWL_API_KEY=

DATABASE_URL=
```

### 19.3 Structured Output

需要定義 LLM 回應格式：

```json
{
  "final_reply": "string",
  "intent": "create_itinerary",
  "missing_requirements": ["origin", "budget"],
  "sources": [],
  "tool_plan": [],
  "itinerary_patch": null,
  "requires_user_confirmation": false
}
```

### 19.4 驗收標準

- [ ] 沒有 Ollama 時，系統顯示可理解錯誤。
- [ ] 沒有外部 API key 時仍可用 mock flow。
- [ ] LLM 回傳非 JSON 時，有 repair/fallback。
- [ ] 不讓 LLM 直接執行危險修改。

---

## 20. 測試 TODO

### 20.1 Unit Tests

至少測：

- [ ] `parseVideoId()`
- [ ] `normalizeSources()`
- [ ] `dedupeSources()`
- [ ] `createItineraryPatch()`
- [ ] `applyItineraryPatch()`
- [ ] `reorderItems()`
- [ ] `selectAgentByIntent()`
- [ ] `validateCitation()`
- [ ] `formatYouTubeTimestamp()`

### 20.2 Integration Tests

至少測：

- [ ] POST `/api/chat` 回傳 structured message。
- [ ] chat response 有 sources。
- [ ] create trip flow。
- [ ] update itinerary flow。
- [ ] source hover API。
- [ ] mock YouTube analyze flow。
- [ ] mock web search flow。

### 20.3 UI Tests

至少測：

- [ ] Chat message render。
- [ ] SourceBadge render。
- [ ] SourceHoverCard hover。
- [ ] CitationList dedupe。
- [ ] ItineraryTimeline render。
- [ ] Map marker selected state。
- [ ] Chat FAB open/close。

### 20.4 Manual QA Checklist

- [ ] 輸入「我想去熊本玩五天四夜」。
- [ ] AI 追問缺少需求。
- [ ] 補充「從台灣出發，預算中等，喜歡美食和自然景點」。
- [ ] AI 建立 trip draft。
- [ ] 進入 trip page。
- [ ] 點選 Day 1 卡片，map marker 高亮。
- [ ] 問 AI「第二天不要太累，幫我放輕鬆一點」。
- [ ] AI 產生 itinerary patch。
- [ ] 使用者確認後套用。
- [ ] source badge hover 可顯示來源。
- [ ] YouTube source timestamp 可開啟影片。
- [ ] 沒有 API key 時畫面不崩潰。

---

## 21. PR 分階段規劃

### PR 1 — Grounded Chat Contract

範圍：

- [ ] 新增 types/models。
- [ ] 新增 mock grounded chat response。
- [ ] 新增 mock itinerary。
- [ ] 新增 SourceBadge / CitationList 基礎版。
- [ ] 修改 ChatMessageBubble 顯示 sources。

不做：

- [ ] 不接 Web Search。
- [ ] 不接 YouTube 真實 API。
- [ ] 不接 Google Maps 真實 API。
- [ ] 不做完整 RAG。

驗收：

- [ ] UI 可以顯示含來源的 AI 回答。
- [ ] typecheck/build 通過。

### PR 2 — Source Hover / Drawer

範圍：

- [ ] SourceHoverCard。
- [ ] SourceDrawer。
- [ ] YouTubeSourceCard。
- [ ] WebsiteSourceCard。
- [ ] MapPlaceSourceCard。
- [ ] itinerary item source badges。

驗收：

- [ ] hover/click 行為正常。
- [ ] mobile 狀態可用。

### PR 3 — Chat Orchestrator + Tool Status

範圍：

- [ ] ChatOrchestrator。
- [ ] AgentOrchestrator。
- [ ] ToolRegistry。
- [ ] ToolCallRecord。
- [ ] ChatToolStatus。
- [ ] mock tools。

驗收：

- [ ] chat flow 顯示 tool status。
- [ ] 可產生 itinerary patch。

### PR 4 — Trip Page + Map Sync

範圍：

- [ ] `/trip/[id]` layout。
- [ ] ItineraryTimeline。
- [ ] TravelMap。
- [ ] selected item / marker sync。
- [ ] AI Chat FAB。

驗收：

- [ ] 點卡片 marker 高亮。
- [ ] 點 marker 卡片 scroll into view。
- [ ] AI patch 後 UI 更新。

### PR 5 — YouTube Analysis

範圍：

- [ ] YouTubeConnector。
- [ ] Transcript parser。
- [ ] Segment extractor。
- [ ] YouTube source references。
- [ ] Mock + optional real provider。

驗收：

- [ ] 可以從 mock transcript 生成 timestamp source cards。

### PR 6 — Web Search / Crawler

範圍：

- [ ] WebSearchService。
- [ ] provider adapters。
- [ ] crawler adapter。
- [ ] website source references。

驗收：

- [ ] mock/provider search 可用。
- [ ] sources 可被 citations 使用。

### PR 7 — RAG

範圍：

- [ ] sources/chunks persistence。
- [ ] keyword search。
- [ ] optional vector search。
- [ ] retrieval service。

驗收：

- [ ] AI 回答能從 source chunks 找引用。

### PR 8 — Export / Sharing / Preferences

範圍：

- [ ] user travel preference。
- [ ] export markdown。
- [ ] share page。
- [ ] analytics / feedback 基礎版。

---

## 22. Codex 回報格式

每次 Codex 完成任務後，請輸出：

```markdown
# Implementation Report

## Summary
- What changed:

## Files Added
- file:

## Files Modified
- file:

## How to Test
1.
2.

## Commands Run
- command:
- result:

## Risks / Follow-up
- risk:

## Screenshots / UI Notes
- note:
```

如果無法完成，請輸出：

```markdown
# Blocked Report

## What I tried
-

## What blocked me
-

## Files inspected
-

## Recommended next step
-
```

---

## 23. 禁止事項

- [ ] 不要把 Onyx repo 當作 dependency 直接 import。
- [ ] 不要把 Onyx UI 完整照搬。
- [ ] 不要改 Onyx 原始碼。
- [ ] 不要把 AIYO_new 改成企業文件搜尋平台。
- [ ] 不要一口氣重構整個專案。
- [ ] 不要在前端暴露 admin API key。
- [ ] 不要讓 citations 指向使用者無權查看的 private resource。
- [ ] 不要讓 LLM 捏造營業時間、票價、交通時間。
- [ ] 不要讓 LLM 直接刪除行程項目而不詢問。
- [ ] 不要硬編模型名稱、API key、URL。
- [ ] 不要移除既有功能，除非使用者明確要求。
- [ ] 不要破壞現有 routes。
- [ ] 不要新增未使用的大型套件。
- [ ] 不要使用未維護或安全性不明的套件處理 API key。
- [ ] 不要把 mock data 誤標為真實資料。

---

## 24. Definition of Done

整體任務完成時，AIYO_new 至少要具備：

- [ ] 使用者可以在 `/chat` 用自然語言提出旅遊需求。
- [ ] AI 可以判斷缺少哪些需求並追問。
- [ ] AI 可以產生 structured trip draft。
- [ ] AI 回答可以顯示 source citations。
- [ ] hover/click source 可以看到來源預覽。
- [ ] trip page 有 itinerary timeline。
- [ ] trip page 有 map 區域。
- [ ] itinerary items 可以關聯 sources。
- [ ] AI 可以產生 itinerary patch。
- [ ] 使用者確認後可以套用 itinerary patch。
- [ ] YouTube source 可以顯示 timestamp card。
- [ ] Web source 可以顯示 title/snippet/url。
- [ ] Google Place source 可以顯示 address/rating。
- [ ] 沒有外部 API key 時仍能跑 mock demo。
- [ ] lint/typecheck/build 通過。
- [x] docs/AIYO_ONYX_GAP_REPORT.md 已完成。
- [x] docs/IMPLEMENTATION_NOTES.md 已更新。
- [ ] `.env.example` 已更新。
- [ ] README 或開發文件已加入啟動方式與功能說明。

---

## 25. 第一個要執行的具體任務

請 Codex 從這裡開始：

```text
任務：建立 AIYO_new x Onyx Architecture Gap Report，不修改任何功能檔案。

步驟：
1. 掃描 AIYO_new 專案架構。
2. 掃描 F:\Projects\Githubs\onyx 中 chat、citation、agent、action、web search、RAG、widget 相關位置。
3. 建立 docs/AIYO_ONYX_GAP_REPORT.md。
4. 在報告中列出 P0/P1/P2/P3 優先順序。
5. 列出第一個 PR 要新增與修改的檔案。
6. 不要實作功能。
7. 不要修改 Onyx。
```

完成後，等待使用者確認，再開始 PR 1。

### 執行狀態（2026-05-17）

- [x] 已掃描 `AIYO_new/aiyo` 架構
- [x] 已掃描 `F:\Projects\Githubs\onyx`（read-only，路徑已確認存在）
- [x] 已建立 `docs/AIYO_ONYX_GAP_REPORT.md`
- [x] 已建立 `docs/IMPLEMENTATION_NOTES.md`（本階段筆記）
- [x] 未修改 Onyx；未修改 AIYO 功能程式碼
