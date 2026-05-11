# LIVE_API Final Validation Report

日期：2026-05-10  
專案：AIYO_new/aiyo  
情境：嘉義市，2 天 1 夜，2 人，預算 8000，偏好美食、夜市、文化景點、火雞肉飯、砂鍋魚頭、老屋街區、拍照。

## 結論

LIVE_API 條件有啟用，且必要環境變數存在，但 YouTube Data API 在真實搜尋階段回報 quota exceeded，因此本輪真實 YouTube 搜尋與後續真實 transcript/summary 驗證未完全完成。依要求沒有硬改測試通過；已記錄 quota exceeded，並以現有 replay/e2e harness artifact 驗證地圖、行程、reload 與資料品質門檻。

## 環境確認

| Key | 狀態 |
|---|---|
| LIVE_API | 測試指令中設為 1 |
| YOUTUBE_API_KEY | exists |
| GOOGLE_MAPS_API_KEY | exists |
| OLLAMA_BASE_URL | exists |
| OLLAMA_MODEL | exists |

未在報告輸出任何 secret value。

## 測試結果

| 指令 | 結果 |
|---|---|
| LIVE_API=1 npx playwright test tests/e2e/live-video-pipeline.spec.ts --trace on | skipped，真實 YouTube 搜尋 quota exceeded，已輸出 live search artifact |
| LIVE_API=1 npm run e2e:full-qa | Pass，3/3 |
| npm test | Pass，58/58 |

## 真實影片搜尋

| title | videoId | channel | duration |
|---|---|---|---|
| 無，YouTube quota exceeded | - | - | - |

YouTube quota：遇到限制。fallbackReasons 皆記錄於 `tmp/e2e-artifacts/json/live-api-video-search-results.json`。

## Transcript / Summary

| 項目 | 結果 |
|---|---|
| 是否使用真實 transcript | 否，quota 導致 live summary 未執行 |
| 是否使用 description fallback | 本輪 live 未執行；fallback artifact 為 e2e harness synthetic/fallback |
| summarySegments 是否可用 | 是，fallback/harness artifact 有可用 segments |
| description fallback 是否標記 low confidence | 是，若 segment 來自 description fallback 需為 low |
| 是否仍有簡體中文 | 未在 fallback/harness artifact 偵測到 |

## extractedLocations

- 文化路夜市
- 林聰明砂鍋魚頭
- 民主火雞肉飯
- 檜意森活村
- 北門驛

## rawMention / cleanedName / geocode decision

| rawMention | cleanedName | finalName | decision | verified |
|---|---|---|---|---|
| 文化路夜市 | 文化路夜市 | 文化路夜市 | accepted | yes |
| 林聰明砂鍋魚頭 | 林聰明砂鍋魚頭 | 林聰明砂鍋魚頭 | accepted | yes |
| 民主火雞肉飯 | 民主火雞肉飯 | 民主火雞肉飯 | accepted | yes |
| 檜意森活村 | 檜意森活村 | 檜意森活村 | accepted | yes |
| 北門驛 | 北門驛 | 北門驛 | accepted | yes |

注意：上述 geocode decision 來自目前 fallback/harness artifact；live YouTube 搜尋 quota exceeded，未能產生新的 live summary geocode 決策。程式層級已由單元測試覆蓋 city-level geocode 不可 verified。

## Map / Itinerary

| 項目 | 結果 |
|---|---|
| 套用後 map pins 是否存在 | 是，5 pins |
| /itinerary 是否有資料 | 是，6 items |
| reload 後 itinerary items 是否仍存在 | 是，full QA 已驗證 reload persistence |
| final map pin generic terms | 無 |
| final map pin 口語前綴 | 無 |
| final map pin 簡體中文 | 無 |

Final map pins：文化路夜市、民主火雞肉飯、北門驛、林聰明砂鍋魚頭、檜意森活村。

## Google Maps / Console

| 項目 | 結果 |
|---|---|
| RefererNotAllowedMapError | 未偵測到 |
| Marker deprecation warning | 有，已屬既有技術債 |
| DirectionsService deprecation warning | 有，需後續處理 |
| Directions invalid Place ID | 有，來自 e2e harness 假 placeId，不是 Referer 設定問題 |

## Bugs Found

- YouTube Data API quota exceeded，導致 live 搜尋回傳 0 筆，真實 title/videoId/channel/duration 無法完成驗證。
- e2e 測試在 /chat 因 hidden/visible responsive DOM 同時存在兩個 `chat-input`，造成 Playwright strict locator failure。
- Console/network artifact 可能記錄 Google Maps `key=...` query，已補 redaction。
- 舊 persisted summary cache 可能保留修正前 raw phrase/geocode 結果，已 bump video summary pipeline version 避免讀舊 cache。
- e2e harness 的假 placeId 會造成 Google Directions invalid request；不影響 pins/itinerary 存在，但 demo 若展示 route line 需使用真實 placeId 或避免對 fixture placeId 打 Directions。

## Small Fixes Applied

- `tests/e2e/full-user-travel-flow.spec.ts`：chat input/send button 改用 visible locator。
- `tests/e2e/full-user-travel-flow.spec.ts`：console/network artifacts 寫入前 redact `key=...`。
- `src/server/services/videoSummaryService.ts`：`VIDEO_PIPELINE_VERSION` bump 到 `video-quality-v3`，避免舊 summary cache 污染已修正流程。

## Artifacts

- `tmp/e2e-artifacts/json/live-api-video-search-results.json`
- `tmp/e2e-artifacts/json/live-api-video-summary-quality.json`
- `tmp/e2e-artifacts/json/live-api-map-pins.json`
- `tmp/e2e-artifacts/json/live-api-itinerary-state.json`
- `tmp/e2e-artifacts/json/live-api-geocode-decisions.json`
- `tmp/e2e-artifacts/json/live-api-console-network-summary.json`
- `docs/testing/live-api-final-validation-report.md`

## 仍需人工處理的外部設定

- YouTube Data API quota 需等待重置或提高 quota，才能完成真實影片搜尋與 transcript/summary 全鏈路驗證。
- Google Maps referrer allowlist 目前未出現 RefererNotAllowedMapError；仍建議確認包含 `http://localhost:3000/*`、`http://localhost:3101/*` 與正式部署網域。
- 若 demo 使用 route overlay，需避免 e2e fixture 假 placeId 進 Directions，或改用真實 Google placeId。

## Demo 判定

可進 demo 的範圍：地圖 pins、行程寫入、reload persistence、UI full QA 在 fallback/harness 條件下通過。  
不可宣稱：本輪已完成真實 YouTube 搜尋與真實 transcript/summary 全鏈路驗證，因 quota exceeded。
