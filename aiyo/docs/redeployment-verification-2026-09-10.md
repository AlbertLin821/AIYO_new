# 重部署驗證（2026-09-10，未完成全站驗收）

本紀錄優先於先前遷移報告的「無阻塞」敘述。API 通過不代表 Chrome UI 通過。

## 資料與部署

- 前次作業已依使用者授權清除本專案 Docker volumes 並重新建置；本次沒有重複清除。
- 原資料沒有備份，無法由本次作業還原。目前含驗證帳號與測試產生資料，並非持續空庫。
- 本次恢復 Docker Desktop、Ollama，7 個 Compose 服務皆健康。
- 正式版 3001 已重新 build/start，13 個 migration 無待套用項目。
- 重置 Open WebUI 資料後，應用程式既有 API key 失去對應。使用管理員模型介面恢復同一金鑰，未輸出秘密；應用模型狀態由 HTTP 401 轉為 ready，所有配置模型存在。

## 生產修正

- `scripts/restore-openwebui-key.py`：容器內管理工具，從 stdin 接收既有配置 key，只允許已存在的管理員。
- `src/server/ai/travelAgentOrchestrator.ts`：否定安排詳細行程的語句不再誤觸行程問卷。
- `src/server/maps/providers/photon.ts`：Photon 明確回覆語言不支援時，單次移除 lang 重試；保留原查詢與座標，共用原逾時限制，不以假地點替代。

## 實際驗證

- 真實登入測試帳號後，AI 狀態 ready。
- 聊天 `/api/ai/chat`：修正前回覆錯誤問卷；修正後回覆繁體中文台北旅客類型介紹，mode=answer_trip_question、不啟動搜尋。
- 地圖：實際 Photon 回覆 zh/zh-TW 不支援（400）。修正後搜尋回傳臺北市，反向定位回傳松智路；正式版搜尋亦成功。
- OSRM 實際駕車路線：6332.2 公尺、531.4 秒。
- 字幕：透過正式 provider 擷取 I2kIaEGUiY0，704 筆，source=youtube、captionLanguage=zh-TW、captionKind=manual、captionSource=yt-dlp-vtt。未以生成字幕代替。
- TypeScript `tsc --noEmit` 通過；最新正式版 build 成功並啟動。
- 最近完整 `npm test`：597 通過、0 失敗、0 跳過（397 秒）；隨後增加空搜尋重試與 OSM 導航網址回歸，相關 18 項測試通過。
- Lint：0 錯誤、6 個既有未使用程式碼警告（geocodePlace.ts）。
- 最新 MapLibre Worker + profile Enter 瀏覽器回歸：2 項通過。
- MapLibre + phase7：11 項通過（1.9 分鐘），包含 phase8 腳本挑選的 F–H、J、K。這些測試含受控 API 回覆，不能取代真實外部服務驗收。

## Chrome 實測更新

Chrome 已成功連接，以下取代前次「Chrome 未連接」阻塞。

| 功能 | 實際結果 |
| --- | --- |
| 登入、登出、重新登入 | 通過，使用本次專用驗證帳號 |
| 真實聊天 | 台南一般旅遊介紹得到自然語言回答，否定安排詳細行程不再觸發問卷 |
| 地圖顯示 | 先修正容器高度 0，再發現只有 raster 背景、沒有向量街道。補齊 MapLibre v6 Worker 與 shared module 後，Chrome 實際出現道路、城市名稱、向量底圖；台北101搜尋、點選、資訊卡與縮放已測 |
| 附近餐廳 | 首次服務逾時；重試後實際顯示 12 個餐廳標記 |
| YouTube 字幕、摘要 | 實際分析 I2kIaEGUiY0，顯示時間片段與摘要；點擊 0:21 啟動影片並顯示字幕 |
| 影片地點品質 | 發現舊版把不相關地點映射到台南高鐵站；已修正名稱匹配與範圍拒絕，新版無法驗證時標「僅字幕提及」 |
| 影片加入地圖與行程 | **尚未通過**；新版分析時 Photon 連線逾時，沒有可匯入的已驗證地點，不以假座標補齊 |
| 行程編輯 | 新增赤崁樓、編輯備註與步行交通方式，重新整理仍保留 |
| 行程複製、活動刪除 | 副本成功建立；刪除副本的活動後重新整理確認 0 個停靠點 |
| 分享协作 | 對話框、邀請連結與角色選項正常；未寄送外部邀請，不等於跨帳號協作通過 |
| 設定 | 偏好、AI 長期記憶、隱私頁籤正常顯示；偏好儲存成功 |
| 個人資料 Enter | 修正後 Chrome 實際儲存 AIYO Chrome Test，重新整理仍保留；自動化回歸亦通過 |
| 資料夾 | 建立 Chrome QA 並歸檔測試行程，重新整理仍保留 |
| 協作留言 | 專用行程新增留言並顯示成功，未聲稱跨帳號即時同步已測 |
| 外部導航 | OSM W: 編號不再被誤傳為 Google Place ID；Chrome DOM 確認網址保留正確座標 |

## 本次額外生產修正

- `MapLibreMapView.tsx`：固定容器定位，穩定 pins 依賴，恢復 focusLocation，附近搜尋失敗提供狀態訊息。
- `geocodeVideoPlace.ts`、`geocodePlace.ts`：拒絕已越界或名稱不符的候選，不再把同國家第一筆直接視為驗證成功。
- `tripDestinationScope.ts`、`VideoSummaryDrawer.tsx`：影片目的地優先採用標題最早出現的已知地名；台南標題不被比喻京都及介紹宣傳地名覆蓋。
- `videoSummaryService.ts`：升級 pipeline 版本，舊目的地快取也必須符合目前版本，避免重新引入錯誤座標。
- `repairTripHydration.ts`：不再因 Photon 不提供 Google 照片與網址而每次同步都重複查詢。
- `profile/page.tsx`：Enter 實際儲存，API 成功後才更新本地資料。
- `scripts/copy-maplibre-worker.mjs`、`package.json`、`.gitignore`：predev/prebuild/prebuild:analyze 從安裝套件複製 worker 與 shared module 到 public，版本一致，生成檔不提交；MapLibre 初始化指定本機 worker。
- Worker 作法依據 [MapLibre 官方 Next.js/Turbopack 安裝說明](https://maplibre.org/maplibre-gl-js/docs/#installation)。已讀取本機 Next public-folder 文件。
- `mapPinInfoShared.ts`：OSM 編號不傳入 Google 專屬 Place ID 參數，舊 Google ID 仍可使用。

## 尚未完成

- 公共 Photon 直接呼叫再次出現 `UND_ERR_CONNECT_TIMEOUT`；影片地點匯入仍被外部服務阻塞。
- 真實 AI 行程 E2E：東京三天兩夜初次生成測試超過 720 秒失敗，後續 4 項因 serial 首項失敗而未執行。堆疊位於 helpers/chat.ts 的 sendChatMessage 重試流程；尚未充分定位根因，不能直接歸因 Photon，也不能宣告 live AI 行程通過。
- 仍不可宣告全站驗收通過：跨帳號協作、Google OAuth、語音、上傳、公開分享、地圖拖曳與路線等未全部完成 Chrome 實測。
- 行程初始天數與空白每日安排的互動，以及聊天進度文字精確性仍需進一步檢查。

## 最新續作紀錄（2026-09-10）

- 本輪環境重啟後，七個容器健康，但宿主 Ollama 未啟動。已啟動既有 Ollama；模型 API HTTP 200、30 個模型。travel-chat 短句推論 6.7 秒成功，trip-plan 短句推論 7.6 秒成功。這不等於完整聊天行程成功。
- Photon 本輪 Tainan 查詢 HTTP 200；不再將上一輪逾時視為持續不可用，但仍需驗證影片匯入全流程。
- 本輪 Chrome 控制不可用：可用瀏覽器清單只有內嵌瀏覽器，建立 Chrome 回報 `Browser is not available: chrome`。先前 Chrome 紀錄仍為歷史結果，不能當成本轮重新驗收。
- 真實行程服務呼叫發現三次搜尋預算先被廣泛偏好佔滿，精確 mustVisit 搜尋被截斷。`tripPlanResearchPolicy.ts` 已改為優先指定景點，保留三次搜尋上限及餐廳查詢。
- `travelPlannerService.ts`：缺少指定景點時明確警告；每日摘要只列實際安排的地點；Photon 地點來源不再標記 Google。
- 新增兩項生產回歸：查詢預算保留赤崁樓與神農街；候選充足但指定景點缺漏時仍警告，並驗證摘要與地點來源。
- 最新完整單元測試 **603 通過、0 失敗、0 跳過**；TypeScript 通過。首次新增摘要測試誤把已安排餐廳當成未安排景點，已改為驗證摘要和實際行程一致，未弱化生產檢查。
- 修正後真實開發容器服務呼叫 2.7 秒回傳 fallback，赤崁樓已正確定位；神農街未排入且有明確警告。仍混入台南高鐵站候選，不能宣告路線品質通過。正式容器先前完整呼叫也走 fallback，模型短句成功不代表結構化生成成功。
- 額外發現步行路段 13.45 公里被填入約 17 分鐘，需修正路由模式配置。OSRM 的交通模式由預處理資料決定，不能僅改 URL 的 foot/bike 字串。[OSRM 官方 profiles 說明](https://project-osrm.org/docs/v6.0.0/api/profiles.html)。此問題尚未修正，不可將步行時間視為已驗證。
- 全站驗收仍未完成；需要恢復 Chrome 連線後繼續真實 UI 流程，並修正上述候選品質與路由模式問題。
