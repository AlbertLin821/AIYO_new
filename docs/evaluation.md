# 測試與評估

2026-10-04 的本機重測與 CI 設定修正見[文件核對紀錄](documentation-review-2026-10-04.md)。

本文件區分可重現的程式檢查、外部服務整合及模型品質評估。測試通過只支持它實際檢查的行為，不代表所有旅遊內容正確或正式環境具備特定效能。

## 驗證層次

| 層次 | 檢查內容 | 不足以證明的事 |
| --- | --- | --- |
| 單元測試 | 意圖、偏好、schema、來源對齊、同步競態與 fallback 等規則 | 真實模型理解率、外部資料覆蓋 |
| DB／Redis 整合 | transaction 回滾、ID 衝突、工作去重、擁有者與恢復 | 多人壓力下吞吐量 |
| 瀏覽器流程 | 登入、UI 操作、API 回覆、儲存與重整一致性 | 未執行的瀏覽器／裝置行為 |
| Live AI／影片 | 實際模型與來源的端到端案例 | 大規模品質指標與跨模型等效性 |
| 負載與人工評估 | 目前尚未完成完整基準 | 不應填寫推估成績 |

## 本機命令

在 `aiyo/` 執行，依 [部署指南](setup.md) 準備環境：

```powershell
npm ci
npm run prisma:generate
npm test
npm run lint
npm run build
npx tsc --noEmit
```

`npm test` 使用 tsx 與 Node test runner 執行 `src/**/*.test.ts`，不會自動執行所有 `tests/integration` 與 Playwright 測試。build 與 typecheck 是編譯檢查，不會驗證模型或地圖 provider 的真實可用性。

修改規劃流程時另跑：

```powershell
npm run test:e2e:phase7
npm run test:e2e:phase8
```

目前 Phase 8 是同一份 Phase 7 spec 的 grep 子集，不是獨立測試套件；不可將兩者計數相加宣稱獨立案例總數。完整命令見 [package.json](../aiyo/package.json)。

Playwright global setup 會執行 migration，測試也會建立／修改資料，應使用測試資料庫與專用帳號。設定檔的預設位址可能與現有容器不一致，尤其 gateway 預設仍為 8080。啟動 E2E 前應明確設定：

- `PLAYWRIGHT_DATABASE_URL` 與 `PLAYWRIGHT_REDIS_URL`：宿主機可達的測試服務。
- `PLAYWRIGHT_OPENWEBUI_BASE_URL=http://127.0.0.1:18080`。
- `PLAYWRIGHT_NEXTAUTH_SECRET`：需與測試網站實際密鑰一致。
- `PLAYWRIGHT_BASE_URL`／`PLAYWRIGHT_NEXTAUTH_URL`：同一個實際入口。

已存在的 `DATABASE_URL` 等程序變數會優先於上述 fallback，因此也要檢查 shell 是否留有其他環境的設定。沒有運行中網站時，Playwright 預設嘗試啟動 dev server；已有網站時，本機可重用。不要把連到非預期網站的結果當作本次程式驗證。

有可用模型、搜尋及 worker 時才執行 Live AI：

```powershell
$env:E2E_LIVE_AI = "1"
npm run test:e2e:live-ai:itinerary
Remove-Item Env:E2E_LIVE_AI
```

真實驗證要保留 provider、模型、資料版本、案例輸入、耗時及失敗階段，不只記錄 HTTP 200。

## 既有證據：2026-09-21

完整原始紀錄在[優化與驗證報告](../aiyo/docs/optimization-verification-2026-09-21.md)。此輪正式模式以程序環境將模型角色固定為 `qwen3.5:9b`，不能推論範例設定中的所有角色模型均已驗證。

| 項目 | 當次結果 | 解讀限制 |
| --- | --- | --- |
| 單元測試 | 668 通過、0 失敗、0 跳過 | 部分 fallback 測試隔離真實模型端點 |
| 建置／型別 | 通過 | 不代表 runtime 外部服務可用 |
| Mem0 adapter | 3 項 Python 測試通過 | 不等於中文記憶召回品質已量化 |
| 影片 | 真實影片完成，8 片段、13 地點、總覽 366 字 | 沒有人工標註 precision／recall |
| Redis 整合 | 去重、擁有者、無 worker 待處理、啟動後接手與保存通過 | 不是故障叢集或高併發測試 |
| 真實記憶 | 新增、查看、修改、刪除流程通過 | 約 9.4 秒為單次案例 |
| AI 行程 | 生成、問答、替換、新增、刪除均分批取得通過證據 | 不是同一次 5/5 |
| 全站初次回歸 | 45 通過、4 失敗、3 未執行 | 修正後分別重跑，不是乾淨的單次 52/52 |
| 聊天串流 | 191 次文字更新，247 字，約 39.6 秒 | 不是首 token 時間或 P95 |
| 初次東京規劃 | 整段案例約 4.3 分鐘 | 包含探測及規劃，同輪有 provider 失敗 |

早期報告中的 lint 結果不同，且「相關檔案 ESLint 通過」不等於全專案 lint 通過。GitHub Actions 狀態應以實際 run 為準，不能由本機 build 成功推論 CI 綠燈。2026-10-04 文件核對時，功能基準 `7cb2d2b` 的既有 CI run 為 failure。

## CI 範圍

[aiyo-ci.yml](../.github/workflows/aiyo-ci.yml) 在符合路徑條件的 PR，以及 master／main push 執行 npm ci、lint、unit tests、production build。目前使用 Node 22，與容器主版本一致，並可手動觸發。它沒有啟動模型服務、DB／Redis 整合環境或 Live AI。前面的 lint 失敗會使後續步驟未執行，不能把未執行解讀為通過。

## 後續量化評估

1. **影片標註集：** 至少涵蓋繁中、英文、日文、無字幕、長影片、多城市及同名分店，人工標記地點與片段時間。分別報告地點 precision／recall、時間錨點誤差、錯誤座標率、無依據敘述率；不把未解析案例排除後才計算。
2. **對話矩陣：** 涵蓋偏好沿用、否定目的地、代名詞、局部刪除、整天清空、取消及重播；檢查修改前後資料而非只判讀文字。
3. **效能：** 分開量測冷模型、熱模型、快取、排隊與來源失敗。記錄工作提交、首個有效內容、完整完成及 P50／P95，附樣本數、硬體與並行數。
4. **偏好效益：** 固定城市與行程長度，比較有無排序及不同偏好；硬限制需要可信資料才能驗證，未知資料另列。
5. **服務恢復：** 模擬 Redis／worker／模型中斷、帳號切換與瀏覽器重整，確認資料不越權、不重複套用，失敗有可辨識狀態。

以上為評估規劃，尚未有足夠資料宣稱已達到準確率或延遲目標。
