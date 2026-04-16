# Phase 3.6 Mock 盤點（Mock Audit）

本文件列出 `AIYO_new/aiyo` 內與假資料、後援資料相關的來源，以及主流程中的使用方式與處理策略。

## 1. `src/lib/mock-data.ts`

| 項目 | 說明 |
|------|------|
| **類型** | 本機後援影片目錄（`mockVideos` 陣列） |
| **主流程是否依賴** | 否。僅在 `videoRecommendationService` 於下列條件使用：`ENABLE_MOCK_VIDEO_PROVIDER=true`，或該旗標為 true 且 YouTube Data API 失敗／無結果 |
| **處理方式** | **保留為 dev／後援專用**。已移除同檔案中未再被引用的 `mockUser`、`mockItinerary`、`mockCollabMembers`、`mockStickyComments`、`mockPresence`、`mockChatMessages`，避免誤以為主流程仍會種子這些資料。UI 以 `listProvenance === "mock-fallback"` 與 toast 標示後援清單 |

## 2. `src/server/services/videoRecommendationService.ts`

| 項目 | 說明 |
|------|------|
| **類型** | 匯入 `mockVideos` 並排序後作為後援清單 |
| **主流程** | 預設走 `searchYouTubeVideos`；無結果時若**未**開啟 mock 旗標則回傳**空陣列**（不偽裝成真實搜尋） |
| **處理方式** | 後援僅在設定允許時；理由字串會傳回前端供 toast／badge 顯示 |

## 3. `src/server/services/videoSummaryService.ts`

| 項目 | 說明 |
|------|------|
| **類型** | 逐字稿後援摘要（非 YouTube 真實逐字稿時）、parse 失敗時的防呆 |
| **主流程** | 真實流程優先使用 YouTube 逐字稿；失敗時 `transcriptSource: "fallback"`，UI 以繁中標籤區分 |
| **處理方式** | **保留為 provider fallback**，不可偽裝成「真逐字稿」；可搭配 session／記憶體快取（實作於本輪相關服務） |

## 4. 地理編碼（Geocode）

| 項目 | 說明 |
|------|------|
| **類型** | 逐點：Google Geocode 成功則採用，失敗則該點改用 catalog fallback；整批可標為 `mixed` |
| **主流程** | 由行程／摘要擷取的地名逐點解析，不依賴固定假座標列表作為主資料來源 |
| **處理方式** | **後援**，並在型別上標記 `resolvedFrom`／`mapsProvenance` |

## 5. 地圖元件 `src/components/map/MapView.tsx`

| 項目 | 說明 |
|------|------|
| **類型** | `NEXT_PUBLIC_ENABLE_MOCK_MAPS === "true"` 時強制示範地圖；否則優先 Google SDK，失敗再後援 UI |
| **主流程** | 與環境變數一致；後援時 toast／badge 使用 `zh-TW` 文案標示 |
| **處理方式** | **設定驅動的示範模式**，非偽裝真實 Google 地圖 |

## 6. Zustand stores（`useChatStore`、`useTripStore`、`useMapStore`、`useVideoStore`、`useCollabStore`、`useUserStore` 等）

| 項目 | 說明 |
|------|------|
| **類型** | 初始值為空或預設值，無 `mock-data` 種子 |
| **主流程** | 登入後由 `AppDataBridge` 呼叫 `syncService.loadBootstrap()` → `applyBootstrap`，以伺服端快照為準 |
| **處理方式** | **不以 mock 覆蓋伺服端資料**；詳見 `docs/phase36_stability_and_mock_removal_report.md` 資料流政策 |

## 7. Credentials 登入（已移除示範）

| 項目 | 說明 |
|------|------|
| **類型** | NextAuth Credentials provider（Email + Password） |
| **主流程** | Google OAuth 與 Email/Password 都是正式登入路徑 |
| **處理方式** | 已移除示範帳號與 dev-only 捷徑；Credentials 僅保留為真實帳密驗證 |

## 8. 已刪除／不再作為主流程的 mock 來源

- `mock-data.ts` 內之行程、協作、對話、使用者假資料（已自檔案移除，避免與 DB 混淆）。

## 總結

| 分類 | 範例 | 原則 |
|------|------|------|
| 已刪除 | 未使用之 mock 匯出 | 不留在程式庫誤導 |
| 後援 only | `mockVideos`、逐字稿 fallback、catalog geocode | 必須可從 UI 看出為後援／示範 |
| Dev-only | `ENABLE_MOCK_VIDEO_PROVIDER`、`ENABLE_MOCK_MAPS` | 由設定明確開啟 |
| 主流程 | Bootstrap、API、Ollama、YouTube（在 key 可用時） | 真實資料與 empty state |
