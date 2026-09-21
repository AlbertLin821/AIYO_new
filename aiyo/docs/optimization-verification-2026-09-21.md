# 旅遊規劃優化與驗證（2026-09-21）

## 本次實作

- 影片分析改用 BullMQ / Redis 持久工作佇列。HTTP 提交回傳 202；獨立 worker 處理，前端顯示階段並在重整後恢復輪詢。同一使用者的相同待處理請求去重，結果查詢檢查擁有者。
- 影片工作遇暫時失敗重試，Redis 開啟 AOF。HTTP 端 Redis 斷線快速失敗，worker 保留重新連線能力；前端輪詢有請求期限與有限重試。
- Mem0 寫入交給另一工作佇列，不等待遠端記憶服務完成才回覆聊天。
- Ollama NDJSON / OpenWebUI SSE 解碼為真正文字更新，僅串流頂層 replyText，不顯示模型 reasoning、JSON action 或工具內部資料。最後仍走原有完整解析與行程動作驗證。
- 已儲存偏好與本次條件共用地點排序；本次明確條件優先。歷史「規劃過」與明確「去過」分開，不把未出發行程當成旅行紀錄。
- 影片總覽依字幕片段、具名地點、美食整理；保留可追溯時間，描述欄退回資料不生成假的章節時間。
- 全站測試發現新增活動 ID 會跨行程碰撞。前端改 UUID；儲存端遇其他行程的 ID 會同步重建活動及地圖連結，移除靜默忽略重複資料的行為。
- 修正否定目的地辨識，例如「嘉義市兩天，不要安排阿里山」不再被較長的阿里山別名覆蓋；中文並列排除與英文地名邊界納入測試。
- 地圖同一標記再次點擊可收合資訊。聊天進度註冊最多等待五秒，失敗仍送出聊天；行程預載失敗會釋放送出鎖並顯示可重試錯誤。
- 舊版 `/api/ai/plan` 與 `/api/trip/revise` 也改為記憶佇列；Mem0 寫入可等待 120 秒，查詢仍保留 12 秒上限，不把背景模型寫入時間加到聊天回覆。
- 停止生成涵蓋進度註冊期間，舊請求不得重啟或清除新請求狀態。進度 session 在擁有者驗證成功前不得發布／完成事件。
- 影片恢復紀錄依帳號隔離，401 保留；切換帳號時停止向目前畫面交付前一帳號的結果。搜尋欄在 React 接管前暫時停用，避免初次快速輸入遺失。
- 純文字回覆「沿用」通過確認後，也會把保存的偏好送入規劃器；保留本次明示條件、指定地點和補充備註。空的預設排除清單不再遮蔽保存的排除設定。
- Photon 真實 OSM 類別傳入搜尋結果 types，供興趣排序與排除條件使用；不從搜尋文字猜測未知場所類別。
- 行程儲存序列化：先前 PUT 尚未完成時保留後續更名／刪除，過期回應不覆蓋新內容；切換行程或帳號後忽略舊回應。新增三項延遲回應回歸。
- 背景地點／照片補全完成前檢查行程版本，防止舊快照復原已刪除或更名的活動；延遲查詢回歸先重現再修正。
- Mem0 的 Ollama 擷取預設關閉思考模式（可配置），實測同一真實旅遊偏好由空結果變成有效記憶；加入預設 90 秒服務端逾時，避免無限掛起。未改動封存 vendor。
- 明示「請記住／幫我記住」的陳述以 user 角色送入記憶佇列，不再被僅整理行程摘要的函式丟棄；問句、空要求與忘記／刪除要求不新增記憶。
- AI 只修改活動名稱時清除原地點座標與連結標記，避免新地點查詢失敗後仍指向舊地點；只改時間則保留原地點。測試先重現「新宿仍帶秋葉原座標」再修正。
- 真實 AI 刪除測試找出「刪掉第二天的晴空塔」被誤判為清空第二天。收窄整天／整份行程判斷，不再因出現天數或東京地名就升級刪除範圍；整天清空仍保留確認。以四種具名地點刪除句型與既有整天確認測試驗證。

## 啟動

從 `aiyo/` 執行（需既有 `.env.dev`）：

```powershell
npx tsx scripts/start-local-stack.ts migrate
npx tsx scripts/start-local-stack.ts app
# 另一個終端
npx tsx scripts/start-local-stack.ts worker
# 本機正式建置驗證（先停止上述 app，再啟動）
npm run build
npx tsx scripts/start-local-stack.ts production
```

資料庫、Redis、Mem0、OpenWebUI 使用專案 Docker Compose 服務。Compose 執行前依既有 `scripts/import-compose-dotenv.ps1` 載入專案環境，不使用預設值覆蓋既有金鑰。

網站：http://127.0.0.1:3000 。OpenWebUI 的本機連接埠改為 18080（可用 OPENWEBUI_HOST_PORT 覆寫），避免與既有 8080 服務衝突；容器內部仍用 8080。

本機 Mem0 原先使用過期的虛擬網路 IP，已將 `.env.dev` 的 `MEM0_LLM_BASE_URL` 改為 `http://host.docker.internal:11434` 並重建該容器；容器內實際連線模型 `/api/tags` 回傳 200。健康檢查通過不等於記憶擷取成功，另以記憶 CRUD 測試驗證。

## 已取得證據

本輪正式模式驗證將網站與 worker 各模型角色以程序環境固定為 `qwen3.5:9b`，不覆寫使用者原本各角色模型設定。Ollama 單模型／單並行模式曾卡在模型切換：主機與容器五 token 請求皆超時，Mem0 前序資料處理正常；重啟本次啟動的 Ollama 與 Mem0 後，同一請求 4.7 秒完成。這是運行環境恢復，並非宣稱已修正 Ollama 上游排程器。

Mem0 容器以既有本機依賴映像加入最新版 `docker/mem0` 修正層並重新建立，確保修正隨映像保留。從最新 Python 基底完整重建的 Debian 套件下載較慢，已停止該額外重建；不宣稱完成全新依賴映像的驗證。

- 最終完整單元測試：668 通過、0 失敗、0 跳過（15.1 秒）。模型端點隔離到不可用本機埠，fallback 案例不佔用真實推理；真實 AI 另行驗證。Mem0 adapter Python 測試 3 項通過。
- 正式建置與 TypeScript 檢查通過；新增佇列、串流、排序、摘要及儲存端相關檔案 ESLint 通過。
- 真實登入、AI 回覆與 SSE：HTTP 200，191 次文字更新，247 字回覆，約 39.6 秒完成。這是單次本機測量，不代表 P95 或所有問題的延遲。
- 真實影片 `BAyQ10iPK4M`：202 提交後由 worker 完成，字幕來源 youtube，8 個片段、13 個地點，總覽 366 字。
- Redis 整合驗證：請求去重、擁有者隔離、無 worker 時保留工作、worker 啟動後接手、結果保存均通過。Redis 不可用時的提交在本次測量約 5ms 拒絕。
- 真實資料庫碰撞測試：兩個既有行程提交同一活動／地圖 ID，兩份活動均保留且地圖連結正確。
- 真實記憶瀏覽器流程通過（9.4 秒）：聊天明示記憶 → 背景寫入 → 設定頁查看 → 修改 → 刪除。服務層另以獨立合成帳號驗證精確 token 與 ownership。
- 新增活動、儲存後重整載回通過。影片摘要匯入後的行程／地圖及重整持久化通過。
- 最終 Phase 7 加 editor：11/11 通過（2.2 分鐘）；editor 連續兩次通過。Phase 8：3/3 通過（1.3 分鐘）。測試 helper 保留完整 API、畫面與持久化斷言；拖曳測試等待卡片可見與動畫穩定。
- 頁面定向回歸：10/10 通過，涵蓋問答卡保存、SSE 真實事件格式、地圖標記收合、公開行程發布與複製、影片搜尋、影片工作重整恢復。完整結構化聊天另外 4/4 通過，涵蓋多輪增刪改排序、資料隔離及錯誤模型輸出。
- 首次完整網站瀏覽器回歸共 52 項：45 通過、4 失敗、3 未執行。四項失敗涉及地圖選取測試狀態、編輯儲存競態、明示記憶遺失，以及公開行程頁初始渲染等待；已分別修正並定向複測。這不是一次乾淨的 52/52 執行結果。
- 修正後嘉義完整旅遊流程通過；公開行程 3/3 通過；真實記憶與影片整合 2/2 通過（1.6 分鐘），涵蓋前述未執行案例。影片使用嘉義實際 YouTube 內容，等待摘要抽屜出現後驗證，沒有跳過影片步驟。
- 真實 AI 首輪：生成東京三天兩夜、詢問第二天且不修改，2 項通過；替換地點的回覆數量斷言失敗，後續 2 項未執行。失敗截圖已有回覆與新宿活動，測試改以 API 回覆 ID 精確確認該訊息可見且非空，保留動作及儲存內容斷言。後續替換、新增通過，刪除揭露正式意圖判斷錯誤（誤判清空整天），已修正並重新執行回歸；不得以 API 200 當成刪除成功。
- 東京初次生成整段案例耗時約 4.3 分鐘（包含可用性探測與規劃步驟），同輪有地點 provider 失敗紀錄。功能通過不代表延遲目標已達標，尚需外部地點服務可靠性與模型推論延遲優化。
- 最終修正後 Phase 7：10/10 通過（1.9 分鐘）；Phase 8：3/3 通過（1.3 分鐘）。真實 AI 替換、新增、刪除：3/3 通過（50 秒；分別 26.6、10.6、10.4 秒），包含替換後不保留原地點資料及刪除結果持久化斷言。加上先前通過的生成與問答，五個 live 案例均取得通過證據，但不是同一次 5/5 執行。
- 本輪發現的失敗均已修正並取得對應複測通過證據，沒有尚未處理的測試失敗。完整單次 52/52、效能 P95 與全新 Mem0 依賴映像重建不在已取得證據之列。

## 主要變更檔案

- 正式邏輯：`src/server/jobs/videoJobs.ts`、`src/server/jobs/memoryJobs.ts`、`src/services/videoJobsClient.ts`、`src/server/services/travelPlannerService.ts`、`src/server/services/videoSummaryService.ts`、`src/server/memory/memoryPresentation.ts`、`src/services/syncService.ts`、`src/lib/assistantActions/applyAssistantActions.ts`、`src/lib/chat/workflowRailVisibility.ts`、`src/app/chat/page.tsx`、`docker/mem0/patch_main_for_providers.py`。
- 回歸測試：`src/services/syncService.test.ts`、`src/server/memory/memoryPresentation.test.ts`、`src/lib/assistantActions/applyAssistantActions.test.ts`、`src/server/ai/destructiveConfirmation.test.ts`、`tests/e2e/helpers/chat.ts`、`tests/e2e/live-ai-itinerary-conversation.spec.ts`、`tests/e2e/memory-and-video.spec.ts`、`tests/e2e/itinerary-editor-flow.spec.ts`、`tests/e2e/public-itinerary.spec.ts`。工作區另有先前變更，不能把整份 git diff 都歸為本輪新增。

## 邊界

影片完成／失敗工作最多保留 24 小時或各 500 筆；前端保留最多 30 個待恢復工作。佇列需 Redis 與 worker 持續運行。聊天 SSE 進度目前為單一 Node 行程內共用狀態，多副本部署需再改成共享訊息機制。

本次沒有把地圖示意線變成全球即時大眾運輸路線，也沒有保證無字幕影片必有完整內容。資料不足仍以較少的可驗證地點與明確提示處理；需即時資訊的搜尋政策保持不變。

較大的技術替換與尚待驗收目標見 `optimization-audit-2026-09-21.md`。本次實際導入 BullMQ / ioredis，其餘候選並未假稱完成導入。
