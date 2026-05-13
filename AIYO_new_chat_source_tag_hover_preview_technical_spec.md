# AIYO_new /chat 技術規格文件

互動式旅遊需求蒐集、SearxNG 搜尋、來源 Tag 與 Hover Preview 架構  
版本：v1.0  
日期：2026-05-13

## 0. 文件目的與總覽

本文件定義 AIYO_new 的 `/chat` 功能如何從一般文字對話升級成「可互動問答、可追蹤資料來源、可顯示引用 Tag、可 Hover Preview 的旅遊規劃助理」。

核心方向：LLM 不再只輸出一大段文字，而是輸出結構化 JSON；行程內容與資料來源分離管理；前端依據 `response_type` 渲染 Question Card、Status Step、Travel Plan、Source Tag 與 Tooltip Preview。

## 1. 系統整體架構

```text
使用者輸入
  ↓
Frontend /chat
  ↓ POST /api/chat/message
Chat Orchestrator
  ├─ TripProfile Manager：更新需求欄位
  ├─ Intake Agent：判斷是否需要補問
  ├─ Research Planner：判斷是否需要搜尋
  ├─ Research Service：SearxNG / YouTube / Weather / Official site
  ├─ Source Normalizer：統一來源格式
  ├─ Planner Agent：產生 travel_plan JSON
  └─ Citation Mapper：確認內容與來源對應
  ↓
Frontend Renderer
  ├─ QuestionCard
  ├─ StatusStepList
  ├─ TravelPlanCard
  └─ SourceTag + Hover Preview
```

## 2. 核心設計原則

1. LLM 不直接控制畫面，只輸出 JSON。
2. 內容與來源分離：內容只存 `citations`，來源集中存在 `sources` dictionary。
3. Hover Preview 使用後端整理過的 metadata，不直接依賴前端抓原網頁。
4. 即時性資訊，例如天氣、活動、交通、營業時間、票價，必須有來源。
5. 手機沒有 hover，因此 Source Tag 需要支援 tap 開啟 popover 或 bottom sheet。

## 3. 主要 Response Types

- `question_card`：互動式問答卡。
- `status_step`：處理狀態，例如 Searching the web。
- `text_message`：一般文字回覆。
- `travel_plan`：總覽表格與每日詳細行程。
- `error`：錯誤回應。

## 4. TripProfile 範例

```json
{
  "destination": "熊本",
  "duration_days": 5,
  "duration_nights": 4,
  "departure_location": null,
  "travel_dates": { "start_date": null, "end_date": null },
  "companions": null,
  "traveler_count": null,
  "budget": { "currency": "TWD", "amount_min": null, "amount_max": null, "level": null },
  "special_population": {
    "has_elderly": false,
    "has_children": false,
    "mobility_issue": false
  },
  "preferences": [],
  "transportation": null,
  "accommodation": null,
  "visited_before": [],
  "avoid_places": [],
  "dietary_restrictions": [],
  "disliked_activities": [],
  "pace": null,
  "output_format": "report"
}
```

## 5. Source Schema 範例

```json
{
  "source_id": "src_001",
  "type": "web",
  "provider": "lifegoods",
  "title": "熊本自由行2026｜5天4夜行程規劃",
  "url": "https://example.com/kumamoto-trip",
  "domain": "lifegoods.tw",
  "favicon": "https://example.com/favicon.ico",
  "snippet": "熊本自由行攻略整理好景點、交通方式和美食推薦。",
  "preview_text": "第一次去熊本自由行不知道怎麼安排時，可以參考阿蘇、黑川溫泉、市區景點路線。",
  "thumbnail": "https://example.com/thumb.jpg",
  "published_at": "2026-05-01",
  "retrieved_at": "2026-05-13T10:00:00+08:00",
  "reliability": "high",
  "language": "zh-TW"
}
```

## 6. 前端元件

```text
ChatPage
 ├─ ChatMessageList
 │   ├─ TextMessage
 │   ├─ QuestionCard
 │   ├─ StatusStepList
 │   └─ TravelPlanCard
 │       ├─ SummaryTable
 │       ├─ DayPlanCard
 │       └─ CitationGroup
 │           ├─ SourceTag
 │           └─ SourceTooltipCard
 ├─ ChatInput
 └─ RevisionActionBar
```

## 7. 後端 API

### POST /api/chat/message

用途：接收使用者文字、問答卡答案或行程修改需求，回傳下一個對話狀態。

### GET /api/chat/stream/:sessionId

用途：使用 SSE 推送處理進度。

### GET /api/sources/:sourceId/preview

用途：前端 hover 或手機 tap 時取得更完整的來源預覽。

### POST /api/trip/revise

用途：使用者對已產生行程提出修改。

## 8. 分區塊作業

| 區塊 | 目標 |
|---|---|
| A Schema 與型別定義 | 建立 TripProfile、QuestionCard、TravelPlan、Source、Citation 型別 |
| B Question Card 前端 | 完成問答卡 UI |
| C TripProfile Manager | 後端保存與更新旅遊需求欄位 |
| D Intake Agent | 從自然語言抽取已知資訊並產生補問問題 |
| E Status Step 串流 | 支援處理狀態顯示 |
| F Research Service | 串接 SearxNG / YouTube 搜尋 |
| G Planner Agent | 產生 travel_plan JSON |
| H Citation Mapper | 驗證與清理 citations |
| I Source Tag UI | 顯示來源 Tag |
| J Hover Preview | 顯示來源預覽卡 |
| K Plan Revision | 支援修改已生成行程 |
| L 測試與驗收 | 完成 contract、UI、citation integrity 測試 |

## 9. MVP 建議順序

1. 先定義 JSON Schema 與 TypeScript types。
2. 完成 QuestionCard。
3. 完成 TripProfile Manager。
4. 完成 Planner Agent 的固定 JSON 輸出。
5. 完成 TravelPlanCard。
6. 加入 SearxNG 搜尋與 sources dictionary。
7. 加入 CitationGroup 與 SourceTag。
8. 加入 Hover Preview、YouTube、天氣與活動查詢。

## 10. 驗收清單

- 輸入「我想去熊本玩五天四夜」後，系統能抓到熊本與五天四夜。
- 系統能用 QuestionCard 問同行者、預算、偏好、交通、特殊需求。
- 前端可顯示 Searching the web、整理需求、生成行程等 step。
- 完成後先顯示 Day 1～Day 5 總覽表格。
- 每一天都有交通、景點、特色、美食、提醒。
- 景點、美食、交通、提醒旁可顯示來源 tag。
- 滑鼠移到 tag 上可顯示 title、snippet、thumbnail 或 favicon。
- 不存在的 source_id 不會出現在前端。
- 使用者要求改自駕、放慢、加美食時能產生新版行程。
- 搜尋失敗時系統不崩潰，能說明即時資料不足。
