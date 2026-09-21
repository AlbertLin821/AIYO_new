# Implementation Plan: AIYO 平台強化

**Branch**: `platform-hardening` | **Date**: 2026-09-07 | **Spec**: [spec.md](./spec.md)

## Summary

以「先安全與可重現、再可靠性與邊界、最後完整驗收」的次序強化 AIYO。先做可回復的小版本安全升級與 baseline；接著修正 React correctness、隔離 non-live planner tests、限制 build tracing、保護 place-photo proxy；之後統一 fallback diagnostics 與 legacy API 契約，僅抽取一個低耦合 planner concern；最後依序執行 lint、兩輪 unit、build、指定 E2E，以及由 Windows 實際瀏覽器完成全站 QA。

## Technical Context

**Language/Version**: TypeScript 5、Node.js 26.4.0（執行環境；相容性需驗證）  
**Primary Dependencies**: Next.js 16.2.4 → 16.3.4、React 19.2.4、NextAuth 4.24.14 → 4.24.15、Prisma 6.17.1、Zustand 5、Zod 4  
**Storage**: PostgreSQL（Prisma）、Redis、Mem0、filesystem preloaded destination data  
**Testing**: Node test runner via `tsx --test`、Playwright Chromium、ESLint 9、Next production build/typecheck  
**Target Platform**: Node server + evergreen desktop/mobile browsers；本機 Windows QA  
**Project Type**: Next.js App Router 全端 web application  
**Performance Goals**: 外部 HTTP 皆有 bounded timeout；圖片 proxy 不允許無界請求；不新增明顯 render cascade；build 不追蹤 repository 全域  
**Constraints**: 保留既有 API 與資料模型、不新增付費服務、不全面重寫大型模組、不依賴 live AI 執行 unit tests  
**Scale/Scope**: 約 60 個 App Router routes、數百個 unit tests、主要 9 類瀏覽器流程

## Constitution Check

專案沒有已填寫的 repository constitution，故以 `aiyo/AGENTS.md` 作為治理基準。

- [x] 不只修改測試；production planner/fallback 必須同步修復。
- [x] concrete POI 只來自 verified research、預載資料或使用者輸入。
- [x] 資料不足時減少項目並顯示 warning。
- [x] destination/duration 已知時，模型失敗回 fallback travel plan 而非 502。
- [x] 保留 preference reuse 與 question-card 條件。
- [x] provider 失敗不阻斷整體流程；獨立研究工作允許平行 settled execution。
- [x] 必跑 unit、build、Phase 7、Phase 8；live AI 只在環境可用時執行。
- [x] 不暴露 keys、raw prompts、內部工具或私人資料。
- [x] 修改 Next.js 行為前已查閱 bundled Next 16 docs。

Phase 1 re-check：設計不新增資料庫 schema、不改 verified-place 契約、不取消任何既有品質檢查，通過。

## Project Structure

### Documentation

```text
specs/features/platform-hardening/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── fallback-diagnostics.md
│   ├── legacy-api-aliases.md
│   └── place-photo-proxy.md
├── tasks.md
└── checklists/requirements.md
```

### Source Code

```text
src/
├── app/api/
│   ├── ai/{chat,plan,plan-trip}/
│   ├── chat/message/
│   ├── map/place-photo/
│   ├── trips/public/
│   └── youtube/analyze/
├── components/
│   ├── chat/snake/useSnakeEngine.ts
│   ├── itinerary/ItineraryEditorSection.tsx
│   ├── map/PlaceThumbnail.tsx
│   └── settings/SettingsModal.tsx
├── server/
│   ├── ai/
│   ├── data/preloadedDestinations.ts
│   └── services/travelPlannerService.ts
└── lib/

tests/e2e/
├── auth.spec.ts
├── collaboration-authenticated.spec.ts
├── public-itinerary.spec.ts
└── phase7-travel-agent-flow.spec.ts
```

**Structure Decision**: 保持現有單一 Next.js 應用結構。只在 `src/server/services` 或鄰近 domain 新增小型、單一責任模組；不建立第二套 frontend/backend hierarchy。

## Implementation Phases

### Phase A — Baseline and dependency safety

1. 記錄乾淨 baseline：git status、lint、unit、build、audit。
2. 同步升級 `next` 與 `eslint-config-next` 至 16.3.4，`next-auth` 至 4.24.15。
3. 不自動採用 audit 所建議的 Prisma major/downgrade；先以 `npm update`/overrides 可安全修補 transitive 項目，若殘餘漏洞只能跨 major 修復則記錄風險。
4. 執行 auth targeted tests、lint、unit、build；任何 framework breaking change在本階段修復。

**Exit gate**: build/typecheck 通過；auth 行為不退化；direct critical/high 已修補或有具體殘餘風險記錄。

### Phase B — React correctness

1. `useSnakeEngine` 以單一純初始 snapshot 同步初始化 ref/state。
2. `ItineraryEditorSection` 將有效 expanded days 改成衍生／事件驅動狀態，避免 effect 同步 cascade。
3. `PlaceThumbnail` 以 keyed state boundary 或單一來源狀態重設 retry lifecycle。
4. `SettingsModal` 使用模組層 stable icon registry。
5. 清理本次觸及檔案的 warnings；不 disable lint rules。

**Exit gate**: lint 零 errors，相關畫面狀態測試通過。

### Phase C — Deterministic planner and test isolation

1. 追蹤 stale-context 案例進入 Ollama 的精確呼叫點。
2. 將 required-slot detection、preference-confirmation routing 保持 deterministic-first。
3. 為 model gateway 增加可注入邊界或明確 non-live policy；unit tests 禁止 network escape。
4. 將 timeout、unavailable、invalid JSON、empty research 映射為穩定 fallback reason。
5. 確保正常與 fallback plan 共用既有 title/scope/quality validator。

**Exit gate**: 無 Ollama 時完整 unit suite 連跑兩次通過；指定「東京三天」案例無 network failure。

### Phase D — Build tracing and API hardening

1. 將 preloaded destination runtime path 限定在靜態可分析的 `data/preloaded-destinations`；dev override 不進 production import graph。
2. 簡化 `next.config.ts` 的 env loading/import graph，遵守 bundled Next environment guidance。
3. place-photo proxy 新增純函式 validation、AbortSignal timeout、image MIME allowlist、response length guard、基本 rate-limit contract。
4. Rate limiter 隔離為可替換介面；第一版程序內實作不宣稱跨 instance 強一致。
5. 保持現有合法 URL shape，避免破壞 client cache。

**Exit gate**: build 無 whole-project trace warning；proxy contract tests 全通過。

### Phase E — API/publication contracts and bounded refactor

1. 確認 public publication 的匿名讀取產品契約，透過現有 E2E/頁面行為鎖定，不任意改變可見性。
2. Legacy aliases 保持 body/status 相容，加入 `Deprecation`、`Sunset` 或 `Link` header 與 canonical route 文件。
3. 抽取一個低風險 planner concern（優先 fallback classification/model gateway），避免重排 4,670 行核心流程。
4. 新增無敏感資料的 structured diagnostic type；不引入完整 observability 平台。

**Exit gate**: alias/publication route tests 通過；planner 原有 tests 通過；無 schema migration。

### Phase F — Automated verification

依序執行：

1. `npm run lint`
2. `npm test` 兩次
3. `npm run build`
4. `npm audit --omit=dev`
5. `npm run test:e2e:phase7`
6. `npm run test:e2e:phase8`
7. auth、collaboration-authenticated、public-itinerary 相關 Playwright suites
8. 若 live environment 可用才執行 live-AI itinerary suite

失敗必須分類為 production defect、test defect、environment dependency 或 third-party unavailable；不得跳過／弱化 assertion。

### Phase G — Real browser QA

1. 啟動本機 production-like app 與必要基礎服務。
2. 透過 Windows browser UI 實際執行 `quickstart.md` 的 QA matrix。
3. 覆蓋首頁、註冊/登入/登出、聊天補問、fallback、行程 CRUD/排序/持久化、地圖、設定、影片摘要、協作、發布/公開頁。
4. 檢查 keyboard focus、modal close、loading/error/fallback states。
5. 每項記錄 Pass/Fail/Blocked、實際觀察與限制；發現程式缺陷則回到對應 phase 修復並重測。

**Exit gate**: 所有可執行案例 Pass；Blocked 只允許第三方憑證/CAPTCHA/外部服務限制且 fallback 已驗證。

## Change Safety and Rollback

- 不建立或切換 branch，除非使用者另行要求；feature 名稱只作規格識別。
- 保留 repository root 既有 `README.md`、Dockerfile、docker-compose 修改。
- 每一 phase 都先檢查 diff，避免覆蓋使用者變更。
- dependency lockfile、React fixes、planner、proxy、API contract 分開驗證，方便局部回復。
- 不執行 Prisma destructive migration；rate limiting 不新增資料表。

## Complexity Tracking

| Decision | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| 可替換 rate-limit 介面 + 程序內實作 | 在不新增服務下先降低公開 proxy 濫用風險 | 只驗證 ref/width 無法限制合法但高頻的 quota 消耗 |
| Model gateway 注入邊界 | 防止 unit tests network escape，並統一 unavailable fallback | 單靠全域 env flag 容易受 test worker/module loading 順序影響 |
| 僅抽取一個 planner concern | 建立可維護邊界且控制回歸面 | 全面拆解 4,670 行服務超出本輪安全強化範圍 |
