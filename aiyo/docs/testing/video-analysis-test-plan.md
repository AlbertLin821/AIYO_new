# 影片分析測試計畫

本計畫對應旅遊情境「嘉義市兩天一夜美食與市區景點」，並搭配東京／大阪英文回歸 fixture，驗證 deterministic-first 影片分析 pipeline。

## 測試層級與順序

1. **固定 transcript fixture（必跑）**  
   - 指令：`npm test`  
   - 檔案：`src/server/video/__tests__/chiayiVideoAnalysisPipeline.test.ts`  
   - Fixtures：`src/server/video/__tests__/fixtures/*.ts`  
   - 目的：不受 YouTube 搜尋結果波動影響，驗證擷取、過濾、片段時間排序。

2. **Live／整合情境（選跑）**  
   - 指令：`npm run test:video-scenario`（需在 `aiyo` 目錄執行）  
   - 輸出：`tmp/video-analysis-search-results.json`、`tmp/video-analysis-summary-{videoId}.json`、`tmp/video-analysis-report.md`  
   - 需求：`YOUTUBE_API_KEY`、`GOOGLE_MAPS_API_KEY`（摘要與地理資訊）；`OLLAMA_*`（AI polish，若無則維持 deterministic 輸出）。

3. **前端手動流程**（建議順序）  
   1. 首次進入網站後登入或註冊。  
   2. 於首頁設定目的地與天數（計畫情境例：嘉義市、兩天一夜）。  
   3. 於影片搜尋輸入關鍵字、選擇影片、開啟摘要抽屜。  
   4. 檢查 `summarySegments`：是否有時間戳、標題是否具體、內文是否像逐字稿重貼、`locationHints` 與 `foods` 是否合理。  
   5. 檢查地圖：具名 POI 是否出現；是否誤標「嘉義」「嘉義市」等泛用地名。  
   6. 點擊標記：名稱、縮圖、地址、營業時間、電話、Google Maps 連結等是否可接受。  
   7. 將地點加入行程後，於 `/itinerary` 確認多天分配與持久化（重新整理後仍存在）。

## 驗收門檻（摘要）

- 至少 5 個嘉義具體 POI 自 fixture 擷取成功；泛用地名不得進入最終 mention／extractedLocations 清單（由測試與過濾邏輯保證）。
- 純食物詞（例：火雞肉飯、砂鍋魚頭、takoyaki）留在 `foods`，不作為獨立地點 mention。
- `buildMomentSegments` 輸出依 `startSeconds` 遞增排序。
- `segmentSource` 為 `deterministic-mentions`（deterministic pipeline）。
- zh-CN／zh-Hans 字幕經 preprocess 與 AI 輸出時做簡體字詞正規化（漸進式字詞表）。

## 相關程式位置

| 項目 | 路徑 |
| --- | --- |
| 摘要服務 | `src/server/services/videoSummaryService.ts` |
| YouTube | `src/server/providers/youtubeProvider.ts` |
| 逐字稿前處理 | `src/server/video/transcriptProcessing.ts` |
| Profile | `src/server/video/travelExtractionProfiles.ts` |
| 擷取 | `src/server/video/placeMentionExtractor.ts` |
| 過濾 | `src/server/video/genericLocationFilter.ts` |
| 正規化／合併 | `src/server/video/placeMentionNormalizer.ts` |
| 片段 | `src/server/video/momentSegmentBuilder.ts` |
| 地理編碼 | `src/server/geo/geocodeService.ts` |
| 型別 | `src/types/index.ts` |

## 故障時建議檢查

- API key 未設定：Live 腳本會寫入 provider 備註與空結果；仍以 fixture 測試為準。
- Geocode 信心不足：檢查 `GOOGLE_MAPS_API_KEY` 與目的地國別 bias（台灣縣市關鍵字）。
- Ollama 不可用：摘要仍可由 deterministic segments 產生；polish 略過。
