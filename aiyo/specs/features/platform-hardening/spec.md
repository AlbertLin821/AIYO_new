# Feature Specification: AIYO 平台穩定性、安全性與可維護性強化

**Feature Branch**: `platform-hardening`  
**Created**: 2026-09-07  
**Status**: Approved  
**Input**: 依專案健檢結果，制定完整修正計畫、完成優化，並以自動化測試及實際瀏覽器操作驗證網站主要功能。

## Scope

本工作涵蓋已確認的 production dependency 漏洞、React lint 錯誤、測試對本機 Ollama 的非預期依賴、Next.js 檔案追蹤警告、公開圖片代理濫用風險、API 入口一致性、fallback 可預測性，以及低風險的核心程式邊界整理。大型模組全面重寫、資料庫破壞性遷移、雲端基礎設施部署與付費第三方服務採購不在本次範圍。

## User Scenarios & Testing

### User Story 1 - 安全且可登入的網站 (Priority: P1)

使用者可透過既有帳密或已設定的 Google OAuth 登入，不受已知高風險框架／驗證漏洞影響，且未登入者不能存取私有行程、個人資料、記憶或協作內容。

**Why this priority**: 認證繞過、SSRF、DoS 與 session 問題會直接影響資料與服務安全。

**Independent Test**: 完成依賴稽核、auth route tests 與瀏覽器登入／登出／未授權導頁測試。

**Acceptance Scenarios**:

1. **Given** 未登入訪客，**When** 存取私人頁面或 API，**Then** 系統拒絕存取且不洩漏資料。
2. **Given** 有效帳號，**When** 以瀏覽器登入及登出，**Then** session 與頁面狀態正確切換。
3. **Given** production dependencies，**When** 執行安全稽核，**Then** 本次可修補的 direct critical/high 漏洞為零；無法直接修補者須有風險說明與限制措施。

---

### User Story 2 - AI 服務離線時仍可安全規劃 (Priority: P1)

使用者提供目的地與天數後，即使 Ollama、Open WebUI 或研究供應商無法連線，仍會得到可理解的補問或只使用可驗證地點的降級行程，而不是 5xx 或虛構景點。

**Why this priority**: 這是核心旅遊規劃流程，也是目前唯一單元測試失敗的根因。

**Independent Test**: 關閉所有 live AI provider，執行 planner tests 並在瀏覽器送出規劃請求。

**Acceptance Scenarios**:

1. **Given** Ollama 不可用且行程基本資料不足，**When** 使用者提出「東京三天」，**Then** 系統以 deterministic question card 補問必要欄位。
2. **Given** 模型不可用但目的地與天數完整，**When** 使用者要求完整行程，**Then** 系統回傳符合既有 fallback policy 的 travel plan，不回傳 502。
3. **Given** verified POI 不足，**When** 建立 fallback plan，**Then** 系統縮減項目並顯示資料不足警告，不創造泛稱假景點。

---

### User Story 3 - 行程、地圖與協作維持正常 (Priority: P1)

登入使用者可以建立、編輯、重新排序、儲存、分享與協作行程；地圖標記和交通資訊會跟著行程變更保持一致。

**Why this priority**: 安全升級與狀態重構不得破壞既有主要產品價值。

**Independent Test**: 執行 unit/E2E，並以瀏覽器操作建立行程、增刪活動、拖曳排序、切換地圖與公開分享流程。

**Acceptance Scenarios**:

1. **Given** 已登入使用者，**When** 建立及修改行程，**Then** 重整頁面後資料仍一致。
2. **Given** 有座標的行程項目，**When** 編輯或重新排序，**Then** marker、路線與順序同步更新。
3. **Given** 公開分享連結，**When** 依產品規則以訪客或會員開啟，**Then** 只呈現已發布資料且撤銷後無法再讀取。

---

### User Story 4 - 穩定且易診斷的前端 (Priority: P2)

使用者在聊天等待遊戲、行程編輯、地圖縮圖與設定頁面操作時，不會因 render/effect 狀態錯誤產生閃爍、重設或非預期狀態遺失。

**Why this priority**: 現有四個 React lint errors 指向真實的 render correctness 與效能風險。

**Independent Test**: lint 零錯誤，對相關元件執行 component/unit 測試並以瀏覽器反覆切換狀態。

**Acceptance Scenarios**:

1. **Given** 等待遊戲載入，**When** component render，**Then** 不在 render 階段讀取 mutable ref。
2. **Given** 行程日數或縮圖來源變更，**When** UI 更新，**Then** 不產生同步 effect state cascade。
3. **Given** 設定視窗多次重繪，**When** 興趣標籤顯示，**Then** icon component identity 保持穩定。

---

### User Story 5 - 可重現的品質門檻 (Priority: P2)

開發者在沒有外部 AI 金鑰或本機模型的標準環境中，也能穩定執行 lint、unit tests 與 production build，且不因動態檔案路徑把整個 repository 納入部署 trace。

**Why this priority**: 可重現測試與可控 artifact 是持續交付的基本條件。

**Independent Test**: 在清除 live-provider flags 的環境連續執行兩次 lint/test/build，比對結果與 build warning。

**Acceptance Scenarios**:

1. **Given** 無 Ollama/Open WebUI，**When** 執行 `npm test`，**Then** 所有 non-live tests 通過且不嘗試外部模型連線。
2. **Given** production build，**When** 執行 `npm run build`，**Then** typecheck 和 build 通過，且不出現 whole-project NFT tracing 警告。
3. **Given** lint，**When** 執行 `npm run lint`，**Then** 零 errors；本次觸及檔案不得新增 warnings。

---

### User Story 6 - 受保護的外部 API 成本 (Priority: P2)

網站可繼續顯示 Google place photo，但惡意或高頻請求不應無限制消耗伺服器連線與第三方 quota。

**Why this priority**: 現有公開 proxy 使用 server-side key，具有可被濫用的成本與可用性風險。

**Independent Test**: route tests 驗證輸入、timeout、content type、cache 與速率限制；瀏覽器確認合法圖片正常顯示。

**Acceptance Scenarios**:

1. **Given** 無效 photo reference 或 width，**When** 呼叫 proxy，**Then** 快速回傳 400 且不呼叫 upstream。
2. **Given** upstream 超時、異常 content type 或過大回應，**When** proxy 處理，**Then** 中止並回傳安全的錯誤狀態。
3. **Given** 同一來源短時間大量請求，**When** 超過合理門檻，**Then** 回傳 429 並包含重試提示。

---

### User Story 7 - 清楚的服務邊界 (Priority: P3)

維護者可以在不閱讀數千行單檔的情況下定位 planner 的模型 gateway、fallback、question-card 與 validation 邏輯，且 API alias 有明確 canonical route。

**Why this priority**: 降低後續改動的回歸風險，但不值得在本輪進行高風險全面重寫。

**Independent Test**: 將至少一個具清楚依賴邊界的 planner concern 抽成獨立模組，原有測試維持通過；API alias 有測試與 deprecation 契約。

**Acceptance Scenarios**:

1. **Given** planner source，**When** 維護者修改模型呼叫或 deterministic fallback，**Then** 可在獨立模組完成且有單元測試。
2. **Given** legacy API alias，**When** client 呼叫，**Then** 功能仍相容並回傳 deprecation metadata；canonical route 有文件說明。

### Edge Cases

- 只有 destination 或只有 duration 時，必須補問而非啟動完整研究。
- 使用者本輪目的地與 stale trip context 衝突時，本輪明示值優先。
- 第三方供應商 timeout、HTTP error、invalid JSON、empty result 必須有不同 fallback reason。
- 無 Google key 時，地圖與縮圖應顯示明確降級 UI，不可暴露 server secret。
- rate limiter 位於多 instance 部署時，in-memory 限制僅能作為最低保護；需記錄其部署限制。
- dependency upgrade 造成 Next.js/Auth/Prisma breaking behavior 時，不得以關閉檢查或降低 assertion 解決。
- 公開行程已撤銷、ID 不存在或未發布時，回應需避免洩漏存在性與私人欄位。
- 瀏覽器測試遇到第三方 CAPTCHA、OAuth consent 或付費 API 缺失時，必須記錄為外部限制並測試可控 fallback。

## Requirements

### Functional Requirements

- **FR-001**: 系統 MUST 升級或限制所有已確認的 direct critical/high production dependency 風險。
- **FR-002**: 系統 MUST 維持既有 email/password、Google OAuth、session 與 route authorization 行為。
- **FR-003**: 所有 non-live unit tests MUST 不依賴 Ollama、Open WebUI、Google、YouTube、Tavily 或 Serper 實際連線。
- **FR-004**: Planner MUST 在模型不可用時遵守 repository fallback policy，且不得以 502 取代已知基本資料的 travel plan。
- **FR-005**: Planner MUST 共用 title、destination scope、verified POI 與 itinerary quality validation。
- **FR-006**: 系統 MUST 修復目前四個 React lint errors，且不得停用對應規則規避問題。
- **FR-007**: Production build MUST 將預載資料 filesystem trace 限定在預期資料目錄。
- **FR-008**: Place photo proxy MUST 驗證輸入、設定 upstream timeout、限制允許的媒體類型並提供基本濫用保護。
- **FR-009**: 公開與私人 publication route MUST 有一致且經測試的 authorization contract。
- **FR-010**: Legacy API aliases MUST 指定 canonical route；保留期間 MUST 發出可觀測的 deprecation metadata。
- **FR-011**: 系統 MUST 對 provider failure 與 fallback 提供結構化、無敏感內容的診斷欄位。
- **FR-012**: 本次重構 MUST 採漸進方式，不得全面重寫 planner、chat page 或 map page。
- **FR-013**: 所有 production behavior 修正 MUST 有對應 production code；不得只改測試使其通過。
- **FR-014**: 完成後 MUST 執行 lint、unit、build、Phase 7、Phase 8 與相關 auth/collaboration/public itinerary E2E。
- **FR-015**: 完成後 MUST 使用實際瀏覽器驗證首頁、登入、聊天、行程、地圖、設定、影片摘要、協作與公開分享的可達功能。
- **FR-016**: Browser QA MUST 保存逐項結果、實際觀察與外部環境限制；不得把未執行項目標記為通過。
- **FR-017**: 修改 MUST 保留使用者目前在 repository root 的既有未提交變更。
- **FR-018**: 對安全相依升級 MUST 先閱讀專案所安裝 Next.js 版本文件與相依套件 migration/release guidance。

### Key Entities

- **Planner Request**: 使用者訊息、trip profile、目前 context、偏好與驗證過的研究資料。
- **Provider Result**: provider、狀態、延遲、結果、錯誤類型與 fallback reason，不包含 secret。
- **Travel Plan**: 天數、單一可搜尋地點名稱、時間、交通、備註、驗證位置與 warning。
- **Publication**: 已發布行程的公開識別碼、發布狀態、發布者與可公開欄位。
- **Proxy Request Budget**: 請求來源、時間窗、計數、上游 timeout 與回應限制。
- **Browser QA Case**: 頁面／功能、前置條件、操作、預期、實際結果、證據與限制。

## Non-Functional Requirements

- **NFR-001 Security**: 不得記錄 API keys、raw prompts、密碼、session token 或完整個人偏好。
- **NFR-002 Reliability**: 單一 provider failure 不得阻止可安全降級的主要規劃流程。
- **NFR-003 Performance**: 新增保護不得讓一般圖片或 planner 請求產生無界等待；所有外部 fetch 需有明確 timeout。
- **NFR-004 Maintainability**: 新抽取模組需有單一責任、穩定介面與獨立測試。
- **NFR-005 Compatibility**: 不進行破壞性資料庫遷移；既有 API alias 在本輪保持相容。
- **NFR-006 Accessibility**: 瀏覽器 QA 必須檢查鍵盤操作、可見 focus、對話框關閉與主要表單 label。

## Success Criteria

### Measurable Outcomes

- **SC-001**: `npm run lint` 以 exit code 0 完成，零 errors。
- **SC-002**: `npm test` 在無 live AI provider 的標準環境連續兩次 100% 通過。
- **SC-003**: `npm run build` 與 TypeScript 檢查通過，且沒有 whole-project NFT tracing warning。
- **SC-004**: `npm audit --omit=dev` 不再有可由本次 direct dependency upgrade 修補的 critical/high 項目；任何殘餘項目都有風險接受說明。
- **SC-005**: Phase 7、Phase 8、auth、collaboration 與 public itinerary 相關 E2E 全部通過，或清楚區分可重現程式缺陷與外部環境限制。
- **SC-006**: 瀏覽器 QA 覆蓋首頁、登入／登出、聊天規劃、fallback、行程 CRUD、地圖、設定、影片、協作與公開分享；每項都有 Pass/Fail/Blocked 記錄。
- **SC-007**: Ollama 關閉時，「東京三天」案例不產生外部連線失敗並正確回傳補問／偏好確認流程。
- **SC-008**: Place photo proxy 的 invalid input、timeout、unsupported content、rate limit 均有 automated tests。
- **SC-009**: 本次不新增虛構景點標題、不降低既有 assertions、不改壞使用者未提交檔案。

## Rollout and Recovery

- 相依套件、planner fallback、proxy protection 與 refactor 分成可獨立驗證的 commits/工作單元。
- 每一單元先跑相關 targeted tests，再跑完整品質門檻。
- 若 dependency upgrade 造成不可接受回歸，回復該單元的 lockfile/package changes，而不是停用安全檢查。
- 不執行 destructive database migration；若後續需要 shared distributed rate-limit storage，另立 feature 規格。

## Assumptions

- 本次以現有產品行為與 `AGENTS.md` 為權威，不重新設計旅遊規劃 UX。
- 可以新增小型內部模組與測試，但不新增付費服務。
- Browser QA 使用本機可啟動的應用與測試帳號；真實 OAuth 或付費 provider 若無憑證，驗證其可控 fallback 與 UI 狀態。
- 使用者要求「所有網站功能」解讀為 repository 中可到達的主要使用者流程與公開頁面，不包含無憑證的第三方管理後台。
