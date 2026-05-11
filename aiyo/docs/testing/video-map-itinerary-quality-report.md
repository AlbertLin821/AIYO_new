# 影片、地圖、行程品質評估

日期：2026-05-10

## 本輪結論

本輪完成「真實資料品質穩定化」修正，範圍限於資料清洗、geocode 信心判斷、快取、artifact replay、AI chat 結構化候選寫回與相關測試。未重做 UI，未重構整個專案。

| 面向 | 結果 |
|------|------|
| location mention 清洗 | Pass，口語前綴與連接詞會清掉，句子型泛用片語會丟棄 |
| geocode confidence gate | Pass，city-level / locality 結果不得直接 verified |
| description fallback | Pass，低信心 timestamp 明確標記 |
| YouTube/API cache | Pass，搜尋快取與 summary cache key 已補 pipeline version / destination / query / language / videoId |
| artifact replay | Pass，`LIVE_API=1` 未啟用時使用既有 artifact replay |
| 影片摘要套用 | Pass，明確按鈕後才寫入 map pins 與 itinerary items |
| AI chat proposedChanges | Pass，AI 僅提出候選，使用者按「套用建議到行程」後才寫入 |
| reload 持久化 | Pass，影片摘要與 AI chat 套用後 reload 仍存在 |

## 修改檔案

主要服務端：

- `src/server/video/placeMentionNormalizer.ts`
- `src/server/video/placeMentionExtractor.ts`
- `src/server/video/transcriptProcessing.ts`
- `src/server/video/momentSegmentBuilder.ts`
- `src/server/geo/geocodeService.ts`
- `src/server/services/videoSummaryService.ts`
- `src/server/providers/youtubeProvider.ts`
- `src/server/services/travelPlannerService.ts`
- `src/types/index.ts`

主要前端與同步：

- `src/app/chat/page.tsx`
- `src/components/home/VideoSummaryDrawer.tsx`
- `src/services/syncService.ts`

測試與工具：

- `src/server/video/__tests__/placeMentionCleaning.test.ts`
- `src/server/geo/__tests__/geocodeConfidenceGate.test.ts`
- `src/server/providers/__tests__/youtubeSearchCache.test.ts`
- `tests/e2e/apply-video-summary-to-trip.spec.ts`
- `tests/e2e/live-video-pipeline.spec.ts`
- `tests/e2e/ai-chat-structured-apply.spec.ts`
- `tests/e2e/full-user-travel-flow.spec.ts`
- `tests/e2e/video-summary-map-quality.spec.ts`
- `scripts/replay-video-analysis-artifact.ts`

## Location Cleaning 對照

| Before | After |
|--------|-------|
| `晚上來到文化路夜市` | `文化路夜市` |
| `接著來到旺來山鳳梨文化園區` | `旺來山鳳梨文化園區` |
| `及郭家火雞肉飯` | `郭家火雞肉飯` |
| `然後去檜意森活村` | `檜意森活村` |
| `走路就能逛夜市` | rejected，不進 map pins |
| `等晚上回飯店` | rejected，不進 extractedLocations |
| `這邊附近很多美食` | rejected，不是 POI |

保留店名／景點：`郭家火雞肉飯`、`民主火雞肉飯`、`林聰明砂鍋魚頭`、`文化路夜市`、`旺來山鳳梨文化園區`、`檜意森活村`、`北門驛`。

## Geocode Gate

新增判斷包含：

- cleanedName 與 formatted address / result name 類似度
- Google types 是否為 `establishment` / `tourist_attraction` / `point_of_interest` / `restaurant` / `food` / `park` / `museum` / `transit_station`
- 是否只命中 `locality` / `administrative_area` / `political`
- raw mention 是否為句子型片段
- 是否有 placeId evidence

新增 debug 欄位：`geocodeConfidence`、`geocodeMatchReason`、`geocodeRejectedReason`、`cleanedName`、`rawMention`。

## Description Fallback

Description fallback 仍保留，但會先斷句並過濾 CTA / 社群 / music / email 等噪音。fallback transcript entries 標記：

- `timestampSource: "description-fallback"`
- `timestampConfidence: "low"`

UI 顯示 `描述提及` 與低信心提示，不再把 description fallback 當成精準跳轉。

## Cache / Replay

| 項目 | 驗證 |
|------|------|
| same query cache hit | `youtubeSearchCache.test.ts` 驗證第二次同 query 不重複 fetch YouTube API |
| summary cache | key 包含 pipeline version、videoId、destination、language |
| quota fallback | live e2e 預設 artifact replay；只有 `LIVE_API=1` 才打真實 API |
| artifact replay | `tmp/e2e-artifacts/json/live-video-pipeline-replay.json`、`video-analysis-replay-report.json` |

## AI Chat ProposedChanges

AI chat 回覆支援：

```json
{
  "replyText": "...",
  "proposedChanges": [
    {
      "type": "add_itinerary_item",
      "day": 1,
      "time": "18:30",
      "title": "文化路夜市小吃散步",
      "locationName": "文化路夜市",
      "notes": "...",
      "source": "ai-chat"
    }
  ]
}
```

UI 顯示回覆後提供「套用建議到行程」按鈕。使用者確認後才寫入 itinerary；`tests/e2e/ai-chat-structured-apply.spec.ts` 驗證 reload 後仍存在。

## 測試結果

| 指令 | 結果 |
|------|------|
| `npm test` | Pass，58/58 |
| `npm run lint` | Pass with warning：既有 `cardB` unused warning |
| `npm run build` | Pass |
| `npm run e2e:full-qa` | Pass，3/3 |
| `npx playwright test --trace on` | Pass，23/23 |

## 品質檢查

| 檢查 | 結果 |
|------|------|
| 是否仍有簡體中文 | 單元與 e2e 門檻未偵測到 |
| 是否仍有 generic terms 洩漏 | 新增測試涵蓋，未洩漏為 map pins |
| 是否仍有口語前綴地點 | 新增清洗測試涵蓋，已清除或拒絕 |
| 純 food 是否變 map pin | `火雞肉飯` / `砂鍋魚頭` 等純品項不成 pin |
| 店名是否可變 map pin | 店名與景點仍可寫入 pin |

## 剩餘限制

- Google Maps API key referrer allowlist 需在 Google Cloud Console 設定：`localhost:3101`、`localhost:3000`、未來部署 domain。
- `AdvancedMarkerElement` migration 尚未執行，已記錄於 `docs/testing/google-maps-technical-debt.md`。
- 未啟用 `LIVE_API=1` 時，本輪不消耗 YouTube quota；真實 API 最新結果需另行手動或 CI 設定 `LIVE_API=1` 重跑。
