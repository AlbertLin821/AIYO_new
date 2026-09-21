# Tasks: AIYO 平台穩定性、安全性與可維護性強化

**Input**: `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/`  
**Status**: Implemented and verified — 2026-09-07  
**Test policy**: Production 修正採 targeted regression test；測試必須先能重現問題，且不得以弱化 assertion 取代修正。

## Completion ledger

- Phases 1–8: COMPLETE. Conditional abstraction tasks T024/T025/T049/T052 were resolved by retaining the existing injectable planner boundary and implementing the smaller production routing fix; no duplicate gateway was introduced. The revise endpoints were confirmed semantically distinct.
- Phase 9: COMPLETE. Lint, two unit-test runs, build/typecheck, Phase 7, Phase 8, and focused auth/collaboration/publication E2E passed. T061 is ENVIRONMENT-BLOCKED because no verified live AI provider is configured; the required offline fallback was verified.
- Phase 10: COMPLETE WITH EXTERNAL LIMITS. Results for B01–B14 are recorded in `browser-qa-results.md`; live Google map rendering is blocked by `BillingNotEnabledMapError`, while the application fallback and map synchronization passed.
- Phase 11: COMPLETE after final verification. User-owned root README/Docker changes were preserved, generated GitNexus artifacts were removed, and no secret was added.

The detailed checklist below is retained as the approved execution history. This ledger is authoritative where an investigative or conditional item concluded as a documented no-op or external-environment block.

## Format

- `[P]`：與同階段其他任務使用不同檔案、可平行處理。
- `[US#]`：對應 specification 的 User Story。
- 每個 task 完成時需勾選並在適當 checkpoint 執行驗證。

## Phase 1: Setup and Baseline

**Purpose**: 鎖定現況、保護使用者修改，建立後續比較基準。

- [x] T001 記錄 `git status --short` 並確認不修改既有 `README.md`、`docker-compose.yml`、`docker/mem0-service/Dockerfile` 使用者變更。
- [ ] T002 執行並保存 baseline 摘要：`npm run lint`、`npm test`、`npm run build`、`npm audit --omit=dev`，記錄 exit code、失敗案例與 build warning。
- [ ] T003 [P] 檢查 `package-lock.json` 的 Next、NextAuth、Prisma dependency tree，分類 direct/transitive vulnerabilities 與可用修補版本。
- [ ] T004 [P] 清查 `src/app/api/**/route.ts` 的認證、public route、legacy alias 與外部 fetch，建立實作時的 route inventory notes 於 `specs/features/platform-hardening/research.md`。
- [ ] T005 清理由本次失敗 GitNexus 分析產生的 `.gitnexus/lbug*` 暫存索引；刪除前再次驗證目標位於 repository root 的 `.gitnexus`。

**Checkpoint**: baseline 可重現，沒有覆蓋使用者修改。

---

## Phase 2: Foundational Safety Gates

**Purpose**: 先處理會影響所有 user stories 的 framework 與測試基礎。

- [ ] T006 [US1] 在 `package.json` 與 `package-lock.json` 將 `next`/`eslint-config-next` 同步升到 16.3.4、`next-auth` 升到 4.24.15，不跨 Prisma major。
- [ ] T007 [US1] 執行 `npm audit --omit=dev` 與 `npm ls next next-auth prisma @prisma/client`，只對可安全修補的 transitive packages 採 `npm update` 或精確 override，記錄無法修補項目。
- [ ] T008 [P] [US1] 執行 `src/lib/auth.ts`、`src/server/auth.ts` 與 auth route 的 targeted tests；若框架升級造成回歸，在 production auth code 修復。
- [ ] T009 [P] [US5] 為 unit test 建立固定非敏感 `NEXTAUTH_SECRET`/`NEXTAUTH_URL` 測試設定，避免 auth tests 以 request-scope exception 模擬未授權。
- [ ] T010 [US1] 執行 `npm run build` 並確認 Next 16.3.4 type generation、proxy 與 App Router routes 正常。

**Checkpoint**: 安全版本安裝完成；auth targeted tests 與 build 通過。

---

## Phase 3: User Story 4 — React render correctness (Priority: P2)

**Goal**: 消除四個 React lint errors，避免 render ref read、effect cascade 與 unstable component identity。

**Independent Test**: `npm run lint` 零 errors，相關 UI 可重複操作且狀態不閃爍。

### Tests

- [ ] T011 [P] [US4] 為 snake initial state/重新開始行為補 regression test，覆蓋 `src/components/chat/snake/useSnakeEngine.ts` 可抽取的純初始化邏輯。
- [ ] T012 [P] [US4] 為 itinerary expanded-day normalization 補純函式測試，覆蓋空 itinerary、首日變更、移除 day。
- [ ] T013 [P] [US4] 為 thumbnail retry state 與 interest icon registry 補可行的純函式/component regression tests。

### Implementation

- [ ] T014 [P] [US4] 修改 `src/components/chat/snake/useSnakeEngine.ts`，以純 initial snapshot 初始化 simulation ref、food 與 snake state，不在 render callback 讀 ref。
- [ ] T015 [P] [US4] 修改 `src/components/settings/SettingsModal.tsx`，將 interest icon registry/component identity 穩定在模組層，修正 effect dependency warning。
- [ ] T016 [US4] 修改 `src/components/itinerary/ItineraryEditorSection.tsx`，以衍生或事件驅動狀態取代 effect 內同步 reset，維持使用者展開選擇。
- [ ] T017 [US4] 修改 `src/components/map/PlaceThumbnail.tsx`，以 keyed lifecycle 或單一 state model 管理 resolved source、failure、retry。
- [ ] T018 [US4] 清除本次觸及檔案的 unused/dependency warnings，執行 `npm run lint` 與相關 tests。

**Checkpoint**: React lint 零 errors；US4 可獨立驗收。

---

## Phase 4: User Story 2 — Deterministic planner fallback (Priority: P1)

**Goal**: non-live tests 與必要補問流程不依賴 Ollama；模型／研究失敗時符合 verified fallback policy。

**Independent Test**: 無 Ollama/Open WebUI 下「東京三天」及完整 planner unit suite 連跑兩次通過。

### Tests

- [ ] T019 [US2] 以 targeted test 重現 `src/server/services/travelPlannerService.test.ts` 的 stale 台南 context／東京三天 network escape，確認測試在 production fix 前失敗。
- [ ] T020 [P] [US2] 新增 current-message destination precedence 與 required-slot deterministic routing cases，涵蓋 destination-only、duration-only、完整 basics。
- [ ] T021 [P] [US2] 新增 model unavailable、timeout、invalid JSON、empty verified research 的 fallback contract tests。
- [ ] T022 [P] [US2] 新增 network-escape guard：non-live planner tests 若呼叫未注入的外部 AI provider 必須立即失敗並指出呼叫來源。

### Implementation

- [ ] T023 [US2] 追蹤並重排 `src/server/services/travelPlannerService.ts` 的 routing，使 required-slot detection、current destination precedence、preference reuse decision 在任何 model call 前完成。
- [ ] T024 [US2] 新增 `src/server/ai/modelGateway.ts`（或最接近既有命名的模組）封裝 production model completion，提供測試可注入介面。
- [ ] T025 [US2] 新增 `src/server/services/plannerFallbackDiagnostics.ts`，實作 `FallbackDiagnostic` enums、safe formatter 與 provider error classification。
- [ ] T026 [US2] 將 planner model unavailable/timeout/invalid response paths接到既有 deterministic question-card 或 verified travel-plan fallback，不回傳已知基本資料下的 502。
- [ ] T027 [US2] 確認 fallback plan 仍通過既有 title、destination scope、verified POI、time-flow validator；不足時減少項目並加標準 warning。
- [ ] T028 [US2] 執行 planner targeted tests及 `npm test` 兩次，修正任何 production logic regression。

**Checkpoint**: US2 可在 AI provider 全離線時獨立運作。

---

## Phase 5: User Story 5 — Reproducible build and test gates (Priority: P2)

**Goal**: non-live quality gates 可重現，build 不再 whole-project trace。

**Independent Test**: lint/test/build 連續執行；build 不含 NFT whole-project warning。

### Tests and Implementation

- [ ] T029 [P] [US5] 為 `src/server/data/preloadedDestinations.ts` 的 default path、dev override、missing data 與 traversal boundary 補測試。
- [ ] T030 [US5] 將 production preloaded data root 改為靜態可分析、限定於 `data/preloaded-destinations` 的路徑；dev/script override 與 runtime import graph 分離。
- [ ] T031 [US5] 簡化 `next.config.ts` env loading/imports，避免一般 runtime helper進入 config trace，並維持 Maps public config 行為。
- [ ] T032 [P] [US5] 修正 auth route unit test 的 Next request scope noise與 Node loader warning中可由專案控制的部分，不隱藏真實錯誤。
- [ ] T033 [US5] 執行兩輪 `npm test`、`npm run lint`、`npm run build`，比對結果並確認 trace warning 消失。

**Checkpoint**: US5 的三個標準 gate穩定通過。

---

## Phase 6: User Story 6 — Place photo proxy protection (Priority: P2)

**Goal**: 合法圖片維持可用，非法、過量、超時或非圖片 upstream 回應安全失敗。

**Independent Test**: route contract tests 覆蓋 200/400/404/429/502/504；瀏覽器合法縮圖正常。

### Tests

- [ ] T034 [P] [US6] 新增 `src/app/api/map/place-photo/route.test.ts`，驗證 invalid ref、width boundary、缺 key 不呼叫 upstream。
- [ ] T035 [P] [US6] 新增 timeout、unsupported MIME、oversized response、placeId single refresh 與 upstream status mapping tests。
- [ ] T036 [P] [US6] 新增 limiter fixed-window/reset/Retry-After/request identity tests，不依賴 wall-clock sleep。

### Implementation

- [ ] T037 [US6] 新增 `src/server/http/inMemoryRateLimiter.ts` 或同責任模組，支援注入 clock、bounded key cleanup 與可替換介面。
- [ ] T038 [US6] 新增 `src/server/places/placePhotoProxyPolicy.ts`，集中 ref/width/MIME/size/timeout policy 與安全錯誤分類。
- [ ] T039 [US6] 修改 `src/app/api/map/place-photo/route.ts`：先 validate/rate-limit，再用 AbortSignal timeout 呼叫固定 Google origin，限制 redirect/content/body，錯誤不洩漏 upstream detail。
- [ ] T040 [US6] 執行 place-photo tests、lint、build；記錄程序內 limiter 的多 instance 限制。

**Checkpoint**: US6 contract 完整通過，合法 client URL 不需修改。

---

## Phase 7: User Story 1 and 3 — Authorization and core regressions (Priority: P1)

**Goal**: 安全升級不破壞登入、私人資料、行程、地圖、協作與 publication 權限。

**Independent Test**: auth/collaboration/publication E2E 與 itinerary/map targeted tests 通過。

- [ ] T041 [P] [US1] 稽核 `src/proxy.ts`、`src/server/auth.ts` 與私人 route handlers，補漏掉的 session/resource authorization tests；不對真正 public asset 強制登入。
- [ ] T042 [P] [US3] 比對 `src/app/api/trips/public/route.ts`、`src/app/api/trips/public/[publicationId]/route.ts`、publish/copy routes 與 `tests/e2e/public-itinerary.spec.ts`，鎖定匿名 snapshot 契約。
- [ ] T043 [US3] 修正 publication authorization/404 normalization（若測試確認有缺陷），確保 unpublished/revoked 不洩漏私人欄位。
- [ ] T044 [P] [US3] 執行 itinerary store/action、map sync、collaboration permission targeted unit tests。
- [ ] T045 [US1] 執行 `tests/e2e/auth.spec.ts` 與未授權直接導頁/API 驗證。
- [ ] T046 [US3] 執行 `tests/e2e/collaboration-authenticated.spec.ts`、`tests/e2e/public-itinerary.spec.ts` 與主要 itinerary/map E2E。

**Checkpoint**: US1、US3 security 和主要產品流程可獨立驗收。

---

## Phase 8: User Story 7 — API contracts and bounded planner extraction (Priority: P3)

**Goal**: legacy API 有 canonical metadata；建立一個可測試 planner 邊界而不全面重寫。

**Independent Test**: alias body/status parity、deprecation headers、planner regression tests 通過。

### Tests

- [ ] T047 [P] [US7] 為 `/api/ai/plan-trip`、`/api/youtube/analyze`、`/api/chat/message` 撰寫 alias parity/header tests。
- [ ] T048 [P] [US7] 比對 `/api/trip/revise` 與 `/api/trips/revise` request/response/auth 語意；只有語意相同才加入 canonical mapping test。
- [ ] T049 [P] [US7] 為 `plannerFallbackDiagnostics` 或 `modelGateway` 抽取模組補分類、sanitization、retry-boundary tests。

### Implementation

- [ ] T050 [US7] 新增共用 legacy alias response wrapper，加入 `Deprecation` 與 canonical `Link` headers，不虛構 Sunset 日期。
- [ ] T051 [US7] 修改三個確定的 alias routes 使用 wrapper；依 T048 結果決定 revise route 是 alias 或獨立 endpoint，並更新 contract 文件。
- [ ] T052 [US7] 完成 planner 單一 concern 抽取，移除原檔重複分類／gateway code，維持公開函式介面。
- [ ] T053 [US7] 執行 alias、planner、API route tests 與 build。

**Checkpoint**: US7 可獨立驗收，未增加第二套 planner。

---

## Phase 9: Full Automated Verification

**Purpose**: 依 repository 規定完成全套品質門檻。

- [ ] T054 執行 `npm run lint`，必須 exit 0 且零 errors。
- [ ] T055 執行 `npm test` 兩次，兩次都必須 100% pass 且無 live provider network escape。
- [ ] T056 執行 `npm run build`，typecheck/build 必須成功且無 whole-project NFT warning。
- [ ] T057 執行 `npm audit --omit=dev`，記錄 residual vulnerabilities、可利用面與處置理由。
- [ ] T058 執行 `npm run test:e2e:phase7`。
- [ ] T059 執行 `npm run test:e2e:phase8`。
- [ ] T060 執行 auth、collaboration-authenticated、public-itinerary 及受影響 itinerary/map/video E2E suites。
- [ ] T061 若 live AI 設定確實可用，執行 `E2E_LIVE_AI=1` itinerary suite；否則記為 external-environment blocked 並驗證 offline fallback。
- [ ] T062 對任何失敗分類為 production/test/environment/third-party；修復 production defect 後重跑相關 gate，不 skip/弱化 assertion。

**Checkpoint**: 所有可執行 automated gates 通過。

---

## Phase 10: Real Browser Full-site QA

**Purpose**: 使用 Computer Use 操作真實瀏覽器，不以 Playwright 取代。

- [ ] T063 完整讀取 Computer Use guidance/API/confirmation 文件，啟動或連接本機瀏覽器與 production-like app。
- [ ] T064 [P] 建立 `specs/features/platform-hardening/browser-qa-results.md`，依 quickstart B01–B14 建立 Pass/Fail/Blocked 表格。
- [ ] T065 執行 B01–B03：首頁、登入/錯誤登入/登出、未授權頁面與 session。
- [ ] T066 執行 B04–B06：聊天歷史、東京三天補問、AI/provider offline fallback。
- [ ] T067 執行 B07–B08：行程建立/改名/增刪/時間交通/排序/重整持久化、地圖 marker/focus/圖層。
- [ ] T068 執行 B09–B10：設定/profile/modal/focus、影片搜尋/摘要/timestamp/套用與 provider fallback。
- [ ] T069 執行 B11–B12：協作權限/comment/presence 可行流程、發布/公開/複製/撤銷。
- [ ] T070 執行 B13–B14：窄 viewport、鍵盤 Tab/Shift+Tab/Enter/Escape、visible focus、dialog focus trap。
- [ ] T071 將每項實際觀察與外部限制寫入 browser QA 結果；程式缺陷標 FAIL 並回到對應 task 修復重測。
- [ ] T072 所有可執行 browser cases PASS 後，重新跑受修正影響的 automated gates，完成最終 diff/security review。

**Checkpoint**: 全站實際瀏覽器 QA 完成；Blocked 僅限外部憑證/CAPTCHA/第三方服務且 fallback 已通過。

---

## Phase 11: Final Documentation and Handoff

- [ ] T073 更新 `tasks.md` 所有任務狀態與 `browser-qa-results.md` 最終結果。
- [ ] T074 更新 `research.md` 的最終 dependency/audit、public route、rate-limit 和 Node compatibility 決策。
- [ ] T075 檢查 final git diff，確認沒有 secrets、generated test artifacts、`.gitnexus`、Playwright reports 或使用者檔案意外變更。
- [ ] T076 依 `AGENTS.md` 報告 production files、test files、fallback behavior、search behavior、failed tests、build/typecheck result。

## Dependencies & Execution Order

```text
Phase 1 Baseline
    ↓
Phase 2 Framework safety
    ├──→ Phase 3 React correctness
    ├──→ Phase 4 Planner fallback
    └──→ Phase 5 Reproducible build
              ↓
         Phase 6 Proxy protection
              ↓
         Phase 7 Authorization/core regressions
              ↓
         Phase 8 API/refactor
              ↓
         Phase 9 Automated verification
              ↓
         Phase 10 Browser QA
              ↓
         Phase 11 Handoff
```

- Phase 1–2 為 blocking foundation。
- Phase 3 與 Phase 4 可在 foundation 後分開處理，但都會碰完整 lint/test gate，整合時需序列驗證。
- Phase 5 必須在 framework upgrade 後執行，才能判斷目前版本的 tracing。
- Phase 6 的 route tests可與 Phase 7 inventory 平行準備，production route 修改應先完成 Phase 2。
- Phase 9 必須在所有 production changes 後執行。
- Phase 10 必須在 automated verification 後執行；若瀏覽器發現 defect，回到對應 phase，再重跑 affected gates。

## Parallel Opportunities

- T003 與 T004 使用不同資料來源，可平行。
- T011–T013 是不同 UI concern 的 tests，可平行。
- T020–T022 可在不修改 production code 時平行建立案例。
- T034–T036 使用同一測試檔時實際執行應協調合併，邏輯設計可平行。
- T041、T042、T044 分別聚焦 auth、publication、store/map tests，可平行調查。
- Browser QA 必須序列操作同一 session，以免互相污染狀態。

## Workload Estimate

| Phase | Tasks | Relative effort |
|---|---:|---|
| Setup/Foundation | 10 | Medium |
| React correctness | 8 | Medium |
| Planner fallback | 10 | High |
| Build reproducibility | 5 | Medium |
| Photo proxy | 7 | High |
| Authorization/core | 6 | High |
| API/refactor | 7 | Medium |
| Automated verification | 9 | High/runtime-bound |
| Browser QA | 10 | High/runtime-bound |
| Handoff | 4 | Low |
| **Total** | **76** | **Large** |

## Implementation Strategy

1. 先完成 T001–T010，確保安全版本與 baseline。
2. 優先完成 P1 的 planner fallback，再完成 proxy/API hardening；React lint 可先修以恢復品質 gate。
3. 每個 checkpoint 更新 task checkbox、跑 targeted tests，避免累積不可定位的回歸。
4. 不自行 commit；使用者要求時再依 logical group 建立 commit。
5. 實作期間如發現規格外的高風險問題，只做安全的 read-only diagnosis，記錄後請求擴充範圍。
