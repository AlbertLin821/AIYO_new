# AIYO_full 使用者模擬測試計畫（嘉義兩天一夜）

## 目標

在 `http://localhost:3000` 以真實旅人動線驗證：**onboarding／影片搜尋與摘要／地圖標記／行程編輯／AI chat／主控台與網路**。本計畫與自動化規格對應 `tests/e2e/full-user-travel-flow.spec.ts`、`tests/e2e/video-summary-map-quality.spec.ts`、`tests/e2e/itinerary-editor-flow.spec.ts`。

## 情境資料

| 欄位 | 值 |
|------|-----|
| 目的地 | 嘉義市 |
| 天數 | 2 |
| 人數 | 2 |
| 預算 | 8000 |
| 影片搜尋關鍵字 | `嘉義兩天一夜 美食 文化路夜市 林聰明砂鍋魚頭 民主火雞肉飯 檜意森活村 北門驛` |

## 執行步驟摘要

1. 登入測試帳號（資料庫由 `seedAuthUsers` + `seedChiayiScenarioForUser` 建立）。
2. 若首頁出現 onboarding，輸入目的地與天數並開始；亦可依 bootstrap 行為省略（見執行報告）。
3. 於首頁執行上述影片關鍵字搜尋，紀錄 `GET/POST .../api/videos/recommendations` 回應（寫入 `tmp/e2e-artifacts/json/video-search-results.json`）。
4. 點選首支相關影片卡，等候摘要（`POST .../api/videos/summarize`）；驗證 `summarySegments` 結構、`extractedLocations` 不包含僅泛泛地名清單中之列。
5. 開啟 `/map`，確認載入區塊、`map-marker-panel`、至少三支點（若資料不足則紀錄實際筆數），將 bootstrap 行程中的 pins 寫入 `map-pins.json`。
6. 開啟 `/itinerary`：新增活動「嘉義市立美術館拍照」、`15:30`、類型景點、備註；編輯既有項目；刪除測試項目；視情況拖曳排序。
7. 開啟 `/chat`，送出規劃提示詞，紀錄起訖時間與 AI 訊息內容至 `ai-chat-response.json`。

## 產物路徑

- `tmp/e2e-artifacts/json/*.json`
- `tmp/e2e-artifacts/network/console-messages.json`（由各 spec 聚合）
- `tmp/e2e-artifacts/screenshots/`（手動 MCP ／ Playwright screenshot）
- `tmp/e2e-artifacts/traces/`（使用者以 `--trace on` 執行 Playwright）

## MCP 分工

| 工具 | 用途 |
|------|------|
| Browser MCP | 類旅人瀏覽、表單、截圖、主觀體驗 |
| Chrome DevTools MCP | 主控台、網路、效能追蹤（若連線可用） |
| Playwright | 回歸、trace、程式化断言與工件輸出 |
