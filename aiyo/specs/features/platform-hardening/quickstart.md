# Implementation and Verification Quickstart

## Preconditions

1. 從 `aiyo/` 執行所有命令。
2. 先確認 `git status --short`，保留 repository root 既有修改。
3. 使用 project env loader；不得輸出 `.env*` 內容。
4. Database/Redis 缺失時先啟動專案既有服務流程，不自行清除資料。

## Per-change loop

```powershell
npm run lint
npm test
npm run build
```

Planner 變更需額外跑 Phase 7/8；auth/publication/proxy 變更需跑對應 route/E2E tests。

## Final automated gates

```powershell
npm run lint
npm test
npm test
npm run build
npm audit --omit=dev
npm run test:e2e:phase7
npm run test:e2e:phase8
npx playwright test tests/e2e/auth.spec.ts
npx playwright test tests/e2e/collaboration-authenticated.spec.ts
npx playwright test tests/e2e/public-itinerary.spec.ts
```

若 live AI 已正確配置：

```powershell
$env:E2E_LIVE_AI="1"
npm run test:e2e:live-ai:itinerary
```

## Real Browser QA Matrix

| ID | Area | Required actions | Expected |
|---|---|---|---|
| B01 | Home | 開首頁、檢查推薦/文章/影片區、導覽 | 無 fatal error；loading/fallback 可理解 |
| B02 | Auth | 註冊或測試帳號登入、錯誤密碼、登出 | 錯誤清楚；session 正確建立/清除 |
| B03 | Authorization | 登出後直接開私人頁/API-linked UI | 導向登入或安全拒絕，不閃現私人資料 |
| B04 | Chat basics | 一般問答、開關歷史側欄、重整 | 訊息與 UI 狀態符合既有契約 |
| B05 | Planning | 輸入「東京三天」、回答補問、產生行程 | stale context 不污染；先補必要欄位 |
| B06 | AI fallback | 在 provider unavailable 狀態規劃 | question card 或 verified fallback，不 5xx/假景點 |
| B07 | Itinerary | 建立、重新命名、增刪活動、編輯時間/交通、拖曳排序、重整 | 資料持久且時序/交通同步 |
| B08 | Map | 開地圖、選 marker、focus location、切換圖層/標籤 | marker 與 itinerary 一致；無 key 時有 fallback |
| B09 | Settings/Profile | 開 modal、編輯偏好、avatar 可行流程、鍵盤關閉 | label/focus/保存正常 |
| B10 | Video | 搜尋影片、開摘要 drawer、timestamp、套用至行程 | 可用時正常；provider 缺失有明確降級 |
| B11 | Collaboration | 建房/加入、權限、comment/presence 可行流程 | owner/editor/viewer 權限正確 |
| B12 | Publication | 發布、開公開連結、複製、撤銷 | 僅公開 snapshot；撤銷後不可讀 |
| B13 | Responsive | desktop 與窄 viewport 檢查導覽、modal、表單 | 無不可操作遮擋或橫向溢出 |
| B14 | Accessibility | Tab、Shift+Tab、Enter、Escape、visible focus | 主要流程可鍵盤操作，dialog focus 正確 |

## Result recording

每個案例記錄 `PASS`、`FAIL` 或 `BLOCKED`。`BLOCKED` 必須指出缺少的外部憑證／服務與已驗證的 fallback；程式缺陷不能標為 blocked。發現 fail 後修正並重新跑相關 automated gate 與該 browser case。

