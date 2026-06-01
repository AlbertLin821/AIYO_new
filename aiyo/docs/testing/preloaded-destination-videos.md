# 20 目的地預載影片（120 部）

與首頁搜尋欄相同流程：每個目的地搜尋 6 支 YouTube 影片，執行完整 `summarizeVideo`（重點片段 + 地圖標點），通過自動品質門檻後寫入產品可讀的種子資料。

## 目的地清單（20）

東京、大阪、京都、首爾、曼谷、新加坡、河內、胡志明市、吉隆坡、峇里島、台北、香港、澳門、巴黎、羅馬、倫敦、巴塞隆納、紐約、雪梨、杜拜。

定義於 `scripts/benchmarks/global-video-destinations.ts` 的 `TOP_20_DESTINATION_IDS`。

## 執行種子腳本

```bash
cd aiyo

# 完整 20 × 6（建議 YOUTUBE_API_KEY、GOOGLE_MAPS_API_KEY）
npm run seed:preloaded-videos

# 試跑單一目的地
npm run seed:preloaded-videos -- --only=tokyo

# 中斷後續跑（沿用 tmp/benchmark/global 快取）
npm run seed:preloaded-videos -- --resume

# 對未通過品質的影片強制重跑摘要
npm run seed:preloaded-videos -- --retry-failed
```

## 輸出

| 路徑 | 說明 |
| --- | --- |
| `data/preloaded-destinations/index.json` | 已匯出目的地索引 |
| `data/preloaded-destinations/{destId}.json` | 每地最多 6 支，含完整摘要與標點 |
| `data/preloaded-destinations/seed-report.json` | 執行統計與每支品質結果 |
| `tmp/benchmark/global/{destId}/` | 中間快取（搜尋、摘要、品質 JSON） |
| `video_summary_caches`（DB） | `summarizeVideo` 自動寫入，開啟抽屜可命中快取 |

## 產品行為

`getVideoRecommendations` 在 `DISABLE_PRELOADED_DESTINATION_VIDEOS` 未設為 `true` 時，若查詢符合種子目的地（`destination` 或 `keyword` 含目的地名稱），直接回傳 `source: preloaded-destination-seed` 的 6 支影片，無需再呼叫 YouTube 搜尋。

使用者輸入「東京」或行程目的地為東京時，行為等同已搜尋並完成背景摘要。

## 品質驗證

與 benchmark 共用 `scripts/benchmarks/videoQualityChecks.ts`：

- 片段時間序、泛用地名、bounding box、hints 一致性等
- 僅 **autoPass** 的影片寫入 `data/preloaded-destinations/`
- 每地至少 `--min-pass=4`（預設）支通過才匯出種子檔

人工覆核仍建議抽查 `tmp/benchmark/global/global-video-benchmark-report.md` 或各 `quality-*.json`。
