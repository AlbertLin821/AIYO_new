# youtube-proj 字幕與景點分析遷移報告

日期：2026-05-10

## 遷移摘要

`youtube-proj` 的核心能力主要集中在 `server/main.py` 與 `server/transcript_outline.py`：YouTube metadata/subtitle 擷取、字幕轉繁體、Ollama JSON outline、語意段落合併與旅遊關鍵詞輸出。AIYO 已將這些能力改寫為 Next.js/TypeScript 管線，並接入 `VideoSummaryService`、地理編碼驗證、地圖 pin 與行程套用流程。

本次補強重點：

- 新增 `transcriptPreprocess` 相容匯出，指向現有 `preprocessTranscript`。
- 新增 `buildVideoSegmentPrompt` 相容匯出，指向現有 `buildVideoSummaryPrompt`。
- 調整字幕前處理：8 秒窗口內相同字幕視為重複，避免 YouTube/ASR 連續重覆字幕污染地點擷取。
- 新增 youtube-proj outline fixture 測試，覆蓋重複字幕、具體景點/美食擷取、泛用城市過濾與片段排序。
- 新增 `npm run test:video-migration`，聚合 `npm test` 與 `npm run e2e:full-qa`。

## 檔案移植對照

| 功能／檔案 | youtube-proj 檔案 | AIYO_new 目標檔案 | 狀態 |
|---|---|---|---|
| 字幕前處理 | `server/main.py` (`fetch_transcript`, `transcript_to_traditional_tw`) / `server/transcript_outline.py` (`timeline_and_anchors`) | `src/server/video/transcriptProcessing.ts` | Modify |
| 景點/美食擷取 | `server/transcript_outline.py` (`travel_keywords`) | `src/server/video/placeMentionExtractor.ts` | Modify |
| 名稱正規化 | `server/main.py` (`traditional_tw_convert`) + outline 關鍵詞去重概念 | `src/server/video/placeMentionNormalizer.ts` | Modify |
| 片段生成 | `server/transcript_outline.py` (`validate_and_snap_paragraphs`, `merge_adjacent_paragraphs`) | `src/server/video/momentSegmentBuilder.ts` | Modify |
| 地理編碼服務 | 無直接對應；來源僅輸出 keywords | `src/server/geo/geocodeService.ts` | Modify |
| AI Prompt 與解析 | `server/transcript_outline.py` (`_SYSTEM_PROMPT`, `_user_prompt_for_chunk`, `parse_llm_json`) | `src/server/ai/promptBuilder.ts`, `src/server/ai/responseParser.ts` | Modify |
| 前端：摘要抽屜 | `src/components/TranscriptViewer.tsx`, `SemanticOutlinePanel.tsx` 概念 | `src/components/home/VideoSummaryDrawer.tsx` | Modify |
| 前端：影片卡片 | `src/App.tsx` 影片列表概念 | `src/components/home/VideoCard.tsx` | Modify |
| 前端：地圖檢視 | 無直接對應 | `src/components/map/MapView.tsx` | Modify |
| 前端：行程編輯 | 無直接對應 | `src/components/map/ItineraryPanel.tsx` | Modify |
| 固定字幕測資 | 無正式測試；由 outline API 格式抽出 | `src/server/video/__tests__/fixtures/youtubeTranscriptOutlineFixture.ts` | Add |
| 遷移測試入口 | 無 | `package.json` (`test:video-migration`) | Modify |
| 舊 Python FastAPI runtime | `youtube-proj/server/*.py` | 不搬入 AIYO runtime；作為參考實作 | Deprecated |

## 型別相容性

檢查範圍：`VideoRecommendation`、`VideoSummaryResult`、`VideoSummarySegment`、`LocationReference`、`Timestamp`。

- 僅使用可選屬性擴充，例如 `confidence`、`verified`、`foods`、`sourceTranscriptLineIds`、`timestampSource`、`timestampConfidence`、`debug.pipelineVersion`。
- 未移除既有必要欄位：`VideoRecommendation.extractedLocations`、`timestamps`、`summarySegments`、`VideoSummaryResult.video`、`segments` 仍維持既有形狀。
- 地理編碼結果仍輸出 `LocationReference`，Google 驗證資訊以可選欄位補充。

## 重要函式與測試對應

| 功能 | 函式／介面 | 輸入 | 輸出 | 測試案例 |
|---|---|---|---|---|
| 字幕前處理 | `preprocessTranscript`, `transcriptPreprocess`, `NormalizedTranscriptLine` | `TranscriptEntry[]`, `TravelExtractionProfile` | `NormalizedTranscriptLine[]` | 重複字幕去重、filler prefix 移除、zh-CN 簡轉繁 |
| 景點/美食擷取 | `extractTimestampAwarePlaceMentions`, `PlaceMention` | 字幕行、profile、目的地 hint | `PlaceMention[]` | 中文標點、店名、夜市、英文大阪 fixture、純食物不成地點 |
| 名稱正規化 | `normalizePlaceMentionName`, `cleanPlaceMentionName` | raw mention、profile | cleaned name 或 rejected reason | `臺/台`、別名、前綴移除、泛用片語拒絕 |
| 去重 | `dedupePlaceMentions` | `PlaceMention[]` | 合併後 mentions | 90 秒內近似名稱合併、食物與 transcript line ids 合併 |
| 片段生成 | `buildMomentSegments`, `toVideoSummarySegments` | verified/high-confidence mentions | `VideoSummarySegment[]` | 片段合併、時間排序、非逐字稿 dump 文案 |
| 地理編碼 | `geocodeWithGoogle`, `resolvePlaceMentionsWithGeocode`, `evaluateGeocodeConfidenceGate` | mention/candidate + destination hint | `LocationReference[]`, failures | Google mock 型別信心門檻、市級結果過濾、POI/餐廳接受 |
| AI Prompt | `buildVideoSummaryPrompt`, `buildVideoSegmentPrompt`, `buildVideoMomentPolishingPrompt` | metadata + transcript chunks/moments | JSON-only prompt | schema、繁中、禁止新增 POI、保留 timestamp |
| AI 解析 | `parseVideoSummaryResponse`, `parseVideoMomentPolishingResponse` | raw LLM text | typed result + parse flag | JSON fence/直接 JSON、fallback、moment schema |

## 驗收標準

- `npm test` 通過。
- `npm run lint` 無 error；目前有 1 個既有 warning：`tests/e2e/itinerary-editor-flow.spec.ts` 的 `cardB` 未使用。
- `npm run build` 通過。
- `npm run e2e:full-qa` 通過。
- `npx playwright test --trace on`：23 個 E2E 中 22 個通過；唯一失敗為 `full-user-travel-flow` 在完整長套件下等不到 chat AI message。同一測試已在 `e2e:full-qa` 通過，trace 位於 `test-results/full-user-travel-flow-嘉義兩天一夜完整旅人流程-首頁、影片搜尋與摘要、地圖、行程新增、聊天與工件-chromium/trace.zip`。
- artifact 路徑：`tmp/e2e-artifacts/`，包含 `json/`、`network/`、`screenshots/`、`traces/`。
- 內容品質檢查：單元與 E2E fixture 驗證沒有簡體中文輸出、`extractedLocations` 過濾泛用城市名、片段按時間排序、影片摘要套用後 pins/itinerary 可持久化。
- LIVE_API 安全模式：現有 `tests/e2e/live-video-pipeline.spec.ts` 在未開啟 `LIVE_API` 時輸出 replay artifact，不消耗真實 quota。

## 風險

- `VideoSummaryService` 現在以 deterministic mentions 為主，Ollama 只做文案 polish；若未來要完全重現 youtube-proj 的語意段落 outline，需要新增 chunk outline adapter。
- Google API 金鑰、Places Details 權限、Directions API 舊版 deprecation 會影響地圖細節；E2E harness 使用 `e2e-place-*` placeId 會觸發 Google console error，但不影響驗收。
- Prompt 模板目前較嚴格，能降低泛用地名，但可能漏掉沒有 suffix 的在地店名；需用 fixture 擴充 profile。
- 完整 E2E 長套件仍有 chat 穩定性風險，需追蹤 `/api/ai/chat` 是否在長時間測試後未送出或前端 click 被狀態重置。

## 回滾策略

- 以目前 commit 前狀態作為基準，檔案分原子提交。
- 影片管線可透過 `VIDEO_PIPELINE_VERSION` 上浮或回退 cache key，避免舊摘要污染新結果。
- 若地理編碼驗證誤殺過多地點，可先回退 `evaluateGeocodeConfidenceGate` 門檻或切換 catalog fallback。
- 若前端套用流程出問題，可 revert `VideoSummaryDrawer`／`videoPlaceImport` 相關提交，保留後端測試 fixture 不影響 runtime。

## 本次修改檔案

- `src/server/video/transcriptProcessing.ts`
- `src/server/ai/promptBuilder.ts`
- `src/server/video/__tests__/fixtures/youtubeTranscriptOutlineFixture.ts`
- `src/server/video/__tests__/videoPipeline.test.ts`
- `package.json`
- `docs/youtube-transcript-migration-report.md`
