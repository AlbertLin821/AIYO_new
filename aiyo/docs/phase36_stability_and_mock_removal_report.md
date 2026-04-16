# Phase 3.6 穩定性、Provider 強化、Mock 移除與中文化報告

> 註：本報告中提及的「示範登入」已於後續 Auth Hardening Phase 移除，Credentials 改為正式 Email + Password 登入。

## 1. Modified files（本輪重點變更）

以下包含本階段直接修改或新增之檔案（若與 `git status` 並列，以實際工作區為準）。

### 文案與本地化（延續掃尾）

- `src/locales/zh-TW.ts`：`login`（後續已移除示範登入）、`chat.voiceUnavailableTitle`、`voice.planTranscriptTemplate`／`successAssistantTemplate`、`floatingChat.emptyTitle`／`emptyHint`、`common.notSet`、`videoCard` 縮圖標籤與來源字串等。

### 頁面與元件（本輪）

- `src/app/login/page.tsx`：後續已改為正式 Google OAuth + Email/Password 登入（移除示範登入 UI）。
- `src/app/chat/page.tsx`：麥克風按鈕不再注入假轉寫訊息；改為提示「語音輸入未啟用」之 info toast。
- `src/components/map/VoicePlanningButton.tsx`：送交 `/api/ai/plan` 的 `transcript` 改為繁中模板（行程天數、目的地、預算、興趣、交通）；成功訊息使用 `successAssistantTemplate`。
- `src/components/home/VideoCard.tsx`：縮圖佔位改 `videoCard.thumbLabels`；YouTube 來源字串、`+N 個地點` 收斂至文案檔。
- `src/components/map/FloatingAIChat.tsx`：無訊息時顯示空狀態（`floatingChat.empty*`）。

### 文案與本地化（前序）

- `src/locales/zh-TW.ts`：集中 UI 文案；新增 `itineraryPage`、`onboarding` 等區塊。

### Mock 與後援

- `src/lib/mock-data.ts`：僅保留 `mockVideos` 供影片推薦後援使用；移除未引用之 mock 匯出。

### 元件與頁面（中文化與行為）

- `src/components/map/ItineraryPanel.tsx`：繁中、`zh-TW`、無英文按鈕主流程假資料。
- `src/app/itinerary/page.tsx`：全頁繁中、行程空狀態、`itineraryPanel` 類型標籤共用。
- `src/components/onboarding/OnboardingModal.tsx`：引導文案繁中。

### 其餘（前序階段已修改、本輪一併驗收）

- `src/services/syncService.ts`：Bootstrap 與伺服端快照為準。
- `src/components/providers/AppDataBridge.tsx`：登入後載入 bootstrap 與 realtime。
- `src/components/map/MapView.tsx`：`ENABLE_MOCK_MAPS` 與後援標示。
- `src/server/services/videoRecommendationService.ts`、`videoSummaryService.ts`、geocode 相關路由與服務。
- 多處頁面：`page.tsx`、`chat`、`map`、`collaborate`、`login`、`profile`、影片相關元件等（詳見版本控制 diff）。

---

## 2. Mock audit 結果摘要

| 項目 | 狀態 |
|------|------|
| 已刪除的 mock | `mock-data.ts` 內未使用之 `mockUser`、`mockItinerary`、`mockCollabMembers`、`mockStickyComments`、`mockPresence`、`mockChatMessages` |
| 改為 fallback-only | `mockVideos`（僅 `ENABLE_MOCK_VIDEO_PROVIDER` 或搭配旗標之 API 失敗路徑）；逐字稿／地理編碼之 fallback |
| 仍保留的 dev-only | `ENABLE_MOCK_VIDEO_PROVIDER`、`NEXT_PUBLIC_ENABLE_MOCK_MAPS`／`ENABLE_MOCK_MAPS` |

完整列表見 `docs/mock-audit-phase36.md`。

---

## 3. Localization 結果

| 項目 | 說明 |
|------|------|
| 覆蓋範圍 | 導航、首頁、影片搜尋／卡片／摘要抽屜、地圖頁、行程頁、行程面板、協作、登入、個人資料、Onboarding、全螢幕對話（含語音按鈕提示）、浮動對話空狀態、語音規劃按鈕（送 API 之敘述與成功訊息）、Toast／bootstrap 等多數使用者可見字串 |
| 集中管理 | `src/locales/zh-TW.ts`（`zhTW`），頁面以 `import { zhTW as t } from "@/locales/zh-TW"` 使用 |
| 可擴充性 | 單一 `zhTW` 物件可複製為 `en` 等結構，無需完整 i18n framework 即可擴充 |
| 可能仍為英文者 | 使用者於表單輸入之內容、API／第三方錯誤原始訊息、資料庫內既有英文內容、`mockVideos` 內建示範影片之中繼資料（僅後援顯示時出現） |

---

## 4. Data flow policy

### Bootstrap

1. 使用者通過 NextAuth 後，`AppDataBridge` 呼叫 `GET /api/bootstrap`。
2. `syncService.applyBootstrap(snapshot)` 將快照寫入各 store：行程、地圖 pins、聊天、協作、個人資料等。
3. 協作 `roomId` 存在時啟動 `EventSource` 接收快照更新，再次 `applyBootstrap`。

### Empty state

- 首頁無搜尋結果：顯示「尚未搜尋影片」等（`zhTW.home`）。
- 行程無資料：`itinerary` 空陣列時顯示空狀態區塊與「新增一天」。
- 地圖無 pins：`zhTW.map.noPinsTitle` 等。
- 聊天無訊息：全螢幕對話 `zhTW.chat.emptyTitle`；地圖浮動對話 `zhTW.floatingChat.emptyTitle`。
- 協作無成員／留言：`zhTW.collab.noMembers`、`noComments` 等。

### Local vs remote

- **伺服端快照為準**：`applyBootstrap` 以 API 回傳覆寫對應 store。
- **本地編輯**：行程／地圖變更透過 debounced `PUT` 同步；下次快照或 SSE `snapshot` 事件反映伺服端狀態。
- **衝突策略**：以**伺服端最新快照為準**；本地僅作送出不覆蓋伺服端真理（若 PUT 失敗，使用者可重新整理或由下一輪快照修正）。

---

## 5. Manual QA checklist

### 中文化

- [ ] 側欄、各頁標題與按鈕為繁體中文
- [ ] 行程頁、Onboarding、行程側邊面板無主要英文佔位

### 登入

- [ ] Google 登入可進入受保護頁面（建議主流程）
- [ ] （已移除）示範登入區塊與示範帳預設值

### 首頁

- [ ] 有搜尋結果時顯示真實或 API 結果；無結果時空狀態
- [ ] 後援清單時出現示範／後援標示與 toast

### Chat

- [ ] 無訊息時空狀態
- [ ] 點麥克風：不應自動送出假轉寫內容；應出現「語音輸入未啟用」類提示
- [ ] 登入後訊息與資料庫／bootstrap 一致

### Itinerary

- [ ] 空狀態與「新增一天」
- [ ] 有資料時與 DB／bootstrap 一致；編輯後可同步

### Map

- [ ] 無 pins 時空狀態
- [ ] `NEXT_PUBLIC_ENABLE_MOCK_MAPS=true` 時為示範地圖且文案標示
- [ ] 有 key 時走 Google；SDK 失敗時後援並標示

### Collaboration

- [ ] 無成員／留言時顯示空狀態文案
- [ ] 有資料時與快照／SSE 更新一致

### Provider

- [ ] 逐字稿失敗時顯示後援摘要，且與真逐字稿區隔
- [ ] 地理編碼為逐點混合來源時，UI 可辨識（若已實作 provenance 顯示）

---

## 6. 本輪刻意不做

新頁面大改版、WebSocket 重構、角色系統、付款、分析、部署腳本等；本報告僅聚焦穩定性、mock 邊界、繁中與資料流。
