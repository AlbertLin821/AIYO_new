# 文件核對與本機檢查紀錄

日期：2026-10-04。程式功能基準：`7cb2d2b`。

## 範圍

本次核對根目錄與應用 README、Compose、啟動 helper、worker、環境範本、Prisma schema、主要路由、規劃與個人化服務，以及既有 GitHub Actions 與 2026-09-21 驗證報告。重寫現況文件並建立部署、資料／API、工程決策、評估、貢獻及第三方來源說明。

未更動正式 planner、動作執行器或測試斷言。fallback 與搜尋策略保持原有行為。歷史遷移報告只新增範圍提示，保留當時內容，不把過去成績改寫成新結果。

## 文件中已修正的差異

- Mem0 為目前 Compose 的啟用服務之一；設定範本啟用它，程式在未提供設定時的預設則為 false。
- Open WebUI 宿主機預設埠為 18080，容器內部仍為 8080；同步更正兩份環境範本的 public URL。
- 背景影片與記憶必須執行 worker；既有 PowerShell 啟動腳本不會自動包含它。
- 地圖主流程為 MapLibre 與 OSM 相關供應者，不再把 Google Maps key 列成基本啟動必要條件。
- 影片 API 以 header 選擇非同步路徑，同步相容呼叫仍存在。
- 偏好排序與聊天 SSE 的目前能力，分別限定為規則式候選排序、單 Node 程序進度。
- Mem0 vendor 雖位於 archive，仍為現行映像的建置來源。

## 2026-10-04 實際檢查

本機環境：Windows／PowerShell、Node `v26.4.0`、npm `11.17.0`，使用既有安裝的依賴與專案設定。不是全新機器部署驗證。

| 檢查 | 結果 |
| --- | --- |
| `npm test` | 668 通過、0 失敗、0 跳過，約 16.5 秒 |
| Node 22：`node --import tsx --test "src/**/*.test.ts"` | 668 通過、0 失敗、0 跳過；驗證 CI runtime 可解析原測試 glob |
| `npm run build` | 通過 |
| `npx tsc --noEmit` | 通過 |
| `npm run lint` | 0 errors、6 warnings；既有 geocodePlace.ts 未使用符號 |
| 維護文件的本機相對連結 | 15 份現況文件共 145 個本機相對連結全部存在；不等於外部網址全部可達 |
| `git diff --check` | 通過 |

本輪未重跑 Playwright、Live AI、真實影片、Mem0 CRUD、效能測試或 Docker 全新建置。README 中這些項目的成績均明確引用 2026-09-21 紀錄。

## GitHub CI 修正

[既有 run 35601689918](https://github.com/AlbertLin821/AIYO_new/actions/runs/35601689918) 的 lint 已通過，unit test 在啟動時失敗，訊息為找不到字面路徑 `src/**/*.test.ts`；production build 因此未執行。

workflow 的測試 runtime 原為 Node 20，本次對齊 Docker 使用的 Node 22，以支援既有 quoted test glob。保留 lint、unit tests 與 build，並加入 main push、手動觸發及唯讀 contents 權限。沒有以跳過或放寬測試處理 CI 失敗。

推送後的執行結果請以 [GitHub Actions](https://github.com/AlbertLin821/AIYO_new/actions/workflows/aiyo-ci.yml) 實際 run 為準。本機 Node 26 的通過結果不代替 Ubuntu／Node 22 的遠端結果。
