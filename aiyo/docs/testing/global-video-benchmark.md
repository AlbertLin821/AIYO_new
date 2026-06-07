# 全球熱門景點影片 Pipeline 驗證

對 26 個常見旅遊目的地各搜尋 6 支 YouTube 影片，執行完整 `summarizeVideo`，自動檢查重點片段與地圖標點品質，並產出人工覆核報告。

## 前置條件

在 `aiyo` 目錄執行。建議設定（唯讀，腳本不會修改 `aiyo/.env.dev` 或 `aiyo/.env.prod-live`）：

- `YOUTUBE_API_KEY`：YouTube 搜尋
- `GOOGLE_MAPS_API_KEY`：地點 geocode 驗證
- `OLLAMA_BASE_URL`、`OLLAMA_MODEL`（選用）：摘要 polish

## 指令

```bash
cd aiyo

# 完整 26 目的地 × 6 支（耗時與 quota 較高）
npm run benchmark:global-videos

# 試跑部分目的地
npm run benchmark:global-videos -- --only=tokyo,osaka,seoul

# 中斷後續跑
npm run benchmark:global-videos -- --resume

# 調整每目的地影片數與請求間隔
npm run benchmark:global-videos -- --videos-per-dest=6 --delay-ms=3000
```

## 輸出

| 路徑 | 說明 |
| --- | --- |
| `tmp/benchmark/global/global-video-benchmark-report.md` | 總報告（含人工覆核勾選） |
| `tmp/benchmark/global/results.json` | 機器可讀彙總 |
| `tmp/benchmark/global/_progress.json` | checkpoint（`--resume` 用） |
| `tmp/benchmark/global/{destId}/search.json` | 該目的地搜尋結果 |
| `tmp/benchmark/global/{destId}/summary-{videoId}.json` | 單支摘要 |
| `tmp/benchmark/global/{destId}/quality-{videoId}.json` | 單支品質判定 |

## 基準清單

定義於 [`scripts/benchmarks/global-video-destinations.ts`](../../scripts/benchmarks/global-video-destinations.ts)：26 個目的地、繁中搜尋關鍵字、`genericRejectHints`、國家 bounding box、可選錨點 POI。

## 自動品質門檻

實作於 [`scripts/benchmarks/videoQualityChecks.ts`](../../scripts/benchmarks/videoQualityChecks.ts)：

- 片段 `startSeconds` 遞增
- `extractedLocations` 無泛用地名漏網
- 地圖 pin 座標在目的地國家 bounding box 內
- 片段 `locationHints` 與地點清單 orphan 比例 ≤ 50%
- 警告（不阻擋 pass）：POI 過少、verified 比例低、錨點距離過遠、無逐字稿等

單元測試：

```bash
cd aiyo
npx tsx --test scripts/benchmarks/videoQualityChecks.test.ts
```

## 人工覆核建議

1. 開啟 `global-video-benchmark-report.md`，依目的地抽查 10% 影片。
2. 在 UI 開啟同支影片的摘要抽屜，對照：
   - 片段標題是否為具體 POI（非逐字稿重貼）
   - 地圖 pin 是否在正確城市／國家
3. 報告內勾選「重點片段正確」「地圖標點正確」並記備註。
4. 若某區域 fail 集中，優先調整 `travelExtractionProfiles`、`genericRejectHints` 或 geocode gate，勿為通過測試而降標。

## 與其他測試的關係

- **CI**：`npm test` 仍為 `src/**/*.test.ts` fixture 回歸，不包含本 Live benchmark。
- **嘉義單一情境**：`npm run test:video-scenario`。
- **E2E**：`tests/e2e/live-video-pipeline.spec.ts`（需 `LIVE_API=1`）。

勿將含 API key 的 artifact 提交至 git。
