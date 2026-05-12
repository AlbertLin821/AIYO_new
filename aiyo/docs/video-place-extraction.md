# 影片地點擷取流程

AIYO_new 的影片地點處理改成 deterministic pipeline：

1. `rawCandidateExtractor`
   - 從 transcript、title、description 擷取原始候選。
   - 保留逐字稿時間與 line id，方便後續排序與 segment 建立。

2. `placeNameQualityGate`
   - 清理路線語句、口語前綴、評論包裝。
   - 拒絕逐字稿片段、城市／國家泛稱、泛用區域詞、純食物名稱。
   - LLM 可以提供輔助候選，但不能繞過這道 deterministic validator。

3. `canonicalPlaceResolver`
   - 正規化繁簡與台/臺。
   - 合併常見車站變體，例如 `X站` / `X車站` / `X駅` / `JR X站`。
   - 保留 alias 擴充點，先內建 regression seed。

4. `placeDeduper`
   - 以 `canonicalId` 或 normalized canonical name 合併重複。
   - 保留最早首次提及時間。
   - 合併 aliases、evidence texts、source transcript line ids。

5. `placeVerifier`
   - 優先用 `locationCatalog` 做 gazetteer 命中。
   - 有 Google Maps key 時再做 geocode 驗證。
   - 有 SearXNG 時可做文字搜尋輔助。
   - 若名稱品質高但無外部驗證，才允許 heuristic fallback。

6. `finalPlaceBuilder`
   - 只輸出 final verified / canonical place list。
   - 最多 16 個，依影片中首次出現時間排序。
   - server debug 可回報 rejected candidates 與 pipeline version。

## 前端資料來源

- `VideoSummaryResult.extractedLocations`
- `video.extractedLocations`
- `summarySegments.locationHints`
- map pins

上述欄位現在都只能來自 final verified places，不再直接吃 raw transcript fragment。

## Fallback 行為

- 沒有 transcript 時，仍可從 description fallback text 嘗試擷取。
- 沒有 Google Maps API key 時，不 crash，改用 gazetteer + heuristic。
- 沒有足夠明確地點時，回傳空陣列，不硬猜。
