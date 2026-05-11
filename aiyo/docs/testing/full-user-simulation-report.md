# AIYO Full User Simulation Report

日期：2026-05-10  
專案：`AIYO_new/aiyo`  
測試網址：Playwright `http://localhost:3101`

## 本輪修復項目

| 項目 | 結果 |
|------|------|
| Location mention 清洗 | 已修復口語前綴、連接詞、時間副詞與動作詞；泛用詞清洗後會拒絕 |
| Geocode confidence gate | 已新增 city-level / low similarity / sentence-like mention gate |
| Description fallback 品質 | 已斷句、過濾噪音，並標記 low confidence timestamp |
| YouTube / summary cache | 已補搜尋快取與 summary cache key；live tests 預設 artifact replay |
| AI chat 結構化候選 | 已支援 `proposedChanges`，使用者確認後才寫入 itinerary |
| Google Maps 技術債 | 已新增 `docs/testing/google-maps-technical-debt.md` |

## 修改檔案

- `src/server/video/placeMentionNormalizer.ts`
- `src/server/video/placeMentionExtractor.ts`
- `src/server/video/transcriptProcessing.ts`
- `src/server/video/momentSegmentBuilder.ts`
- `src/server/geo/geocodeService.ts`
- `src/server/services/videoSummaryService.ts`
- `src/server/providers/youtubeProvider.ts`
- `src/server/services/travelPlannerService.ts`
- `src/app/chat/page.tsx`
- `src/components/home/VideoSummaryDrawer.tsx`
- `src/services/syncService.ts`
- `src/types/index.ts`
- `tests/e2e/ai-chat-structured-apply.spec.ts`
- `tests/e2e/live-video-pipeline.spec.ts`
- `scripts/replay-video-analysis-artifact.ts`

## 測試結果

| 指令 | 結果 |
|------|------|
| `npm test` | Pass，58/58 |
| `npm run lint` | Pass with warning：`tests/e2e/itinerary-editor-flow.spec.ts` 既有 unused variable warning |
| `npm run build` | Pass |
| `npm run e2e:full-qa` | Pass，3/3 |
| `npx playwright test --trace on` | Pass，23/23 |

## Location Mention 清洗前後

| 清洗前 | 清洗後 |
|--------|--------|
| `晚上來到文化路夜市` | `文化路夜市` |
| `接著來到旺來山鳳梨文化園區` | `旺來山鳳梨文化園區` |
| `及郭家火雞肉飯` | `郭家火雞肉飯` |
| `然後去檜意森活村` | `檜意森活村` |
| `走路就能逛夜市` | rejected |
| `等晚上回飯店` | rejected |
| `這邊附近很多美食` | rejected |

## Geocode Accepted / Rejected

Accepted examples:

- `郭家火雞肉飯`：restaurant / food / point_of_interest / establishment 類型，通過 confidence gate。
- `文化路夜市`：具體 POI-like 結果，通過 confidence gate。

Rejected examples:

- `旺來山鳳梨文化園區` 若只命中 `Chiayi City, Taiwan 600` + `locality/political`，不得 verified。
- 句子型 raw mention 且 similarity / type evidence 不足時，不建立 map pin。

Debug 欄位：`rawMention`、`cleanedName`、`geocodeConfidence`、`geocodeMatchReason`、`geocodeRejectedReason`。

## Description Fallback

Fallback transcript entries 現在先斷句，再抽 POI candidate。沒有真實 timestamp 時標記：

- `timestampSource: "description-fallback"`
- `timestampConfidence: "low"`

UI 顯示為「描述提及」，避免誤導成精準跳轉。

## Cache / Artifact Replay

| 項目 | 結果 |
|------|------|
| YouTube search cache | same query memory hit，不重複打 API |
| Summary cache | key 含 pipeline version、videoId、destination、language |
| Live API | 只有 `LIVE_API=1` 才打真實 YouTube API |
| Quota fallback | API quota / 未啟用 live 時使用最近 artifact replay，不直接 fail |

## AI Chat ProposedChanges

AI chat 現在支援結構化候選：

- AI 回覆可附 `proposedChanges`
- UI 顯示「套用建議到行程」
- 使用者確認後才寫入 itinerary
- 寫入後 reload 仍存在
- parse 失敗時保留純文字聊天，不破壞對話

E2E：`tests/e2e/ai-chat-structured-apply.spec.ts` 通過。

## 品質狀態

| 檢查 | 結果 |
|------|------|
| 是否仍有簡體中文 | 未在測試門檻中偵測到 |
| 是否仍有 generic terms 洩漏 | 未進 map pins |
| 是否仍有口語前綴地點 | 清洗或拒絕 |
| `走路就能逛夜市` 是否進 map pins | 否 |
| 純 food 是否成 pin | 否 |
| 店名是否可成 pin | 是 |

## Artifacts

- `tmp/e2e-artifacts/json/live-video-pipeline-replay.json`
- `tmp/e2e-artifacts/json/video-analysis-replay-report.json`
- `tmp/e2e-artifacts/json/video-summary-quality-snapshot.json`
- `tmp/e2e-artifacts/json/segment-quality-gate.json`
- `tmp/e2e-artifacts/json/apply-video-summary-map-pins.json`
- `test-results/**/trace.zip`

## 剩餘限制

- `AdvancedMarkerElement` migration 尚未完成；已建立 TODO 文件。
- Google Maps referrer 設定需外部處理：`localhost:3101`、`localhost:3000`、未來部署 domain。
- 本輪最終 live pipeline 以 artifact replay 驗證，未設定 `LIVE_API=1`，因此不消耗 YouTube quota。
