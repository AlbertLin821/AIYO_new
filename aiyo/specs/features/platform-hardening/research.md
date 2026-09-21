# Research and Decisions

## R1 — Framework security versions

**Decision**: Next.js 與 `eslint-config-next` 同步升至 16.3.4；NextAuth v4 升至 4.24.15。

**Evidence**: 2026-09-07 查詢 npm registry，`next` 最新穩定為 16.3.4，`next-auth` v4 最新為 4.24.15。現有 audit 明確指出 Next <16.2.11 的多個 high advisories及 NextAuth <=4.24.14 的 critical/high advisories。

**Rationale**: 同 major/patch upgrade 是最小安全變更，且 Next bundled docs 建議同步更新 `next`、React 與 `eslint-config-next`。React 已是 19.2.4，先不額外更動。

**Rejected**: 直接升 NextAuth/Auth.js v5，因其為較大認證遷移；不符合本輪低風險目標。

## R2 — Prisma audit handling

**Decision**: 保持 Prisma 6.x API，先解析 dependency tree 與可用修補；不接受 audit 顯示的自動降級到 6.12.0，也不直接跳 Prisma 7。

**Rationale**: npm registry 顯示 `@prisma/client` 最新穩定為 7.10.0，屬 major upgrade；CLI registry 狀態亦不同步。盲目降級或跨 major 都可能破壞 schema/client/runtime。Plan 要求以 targeted tree audit 決定 overrides 或留下受控風險說明。

## R3 — Next filesystem tracing

**Decision**: 優先把 runtime filesystem path 靜態限定在 repository 的 `data/preloaded-destinations`，不以 ignore comment 隱藏真實 whole-project trace。

**Evidence**: build import trace 指向 `next.config.ts → preloadedDestinations.ts → videoRecommendationService → route`；bundled Next docs指出動態 imports/paths 可用 `turbopackIgnore`，但這裡資料屬應打包資源，靜態限定更符合意圖。

**Rejected**: 只加 `turbopackIgnore`，因可能導致 production artifact 缺資料。

## R4 — Environment exposure

**Decision**: 保持 runtime-config 只回傳 browser-intended Maps key，並避免透過 `next.config.env` 重複注入不必要值；server key 不得 fallback 到 client。

**Evidence**: bundled Next docs說明 `next.config.env` 的值總會進 JavaScript bundle；非 `NEXT_PUBLIC_` 預設只留 server。現有 resolver 需以測試鎖定 server/client 分離。

## R5 — Planner deterministic boundary

**Decision**: required slots、current-message destination precedence、preference reuse decision 先由 deterministic logic 完成；只有文案美化與完整 itinerary composition 使用模型。

**Rationale**: 目前「東京三天」補問測試會逸出至 Ollama。核心流程判斷不應被模型可用性控制，且符合 repository fallback policy。

**Rejected**: 測試內全域 mock fetch，因會掩蓋錯誤的 production call ordering。

## R6 — Place photo abuse protection

**Decision**: 使用 request identity + sliding/fixed window 程序內 limiter 作最低防線，搭配 timeout、MIME allowlist、Content-Length/stream budget；介面保持可替換。

**Rationale**: 不新增付費服務或 schema。Next bundled docs亦指出 lambda route handlers 不能跨請求可靠共享程序狀態，所以文件必須明示多 instance 限制。

**Rejected**: 僅要求登入，因公開行程仍需要圖片；僅靠 browser cache 也無法阻止攻擊者 bypass cache。

## R7 — Public publication semantics

**Decision**: 先以既有頁面與 E2E 鎖定實際產品契約，再修正 route；預設原則是讀取已發布 snapshot 可匿名，建立、複製、發布、撤銷需要 session/權限。

**Rationale**: 路由命名與目前 authentication 使用存在歧義，不能僅依名稱改 production 行為。

## R8 — Browser verification

**Decision**: 自動化測試全綠後，再用 Windows Chromium/Edge 類瀏覽器以 UI 操作；不以 Playwright 結果取代人工式瀏覽器 QA。

**Rationale**: 可觀察 hydration、focus、modal、loading、map/iframe 與跨頁 session 等自動 assertion 未必捕捉的問題。

## R9 — Node compatibility

**Decision**: 記錄目前 Node 26.4.0，但以專案/Next 支援矩陣為準；若出現 loader/runtime 相容問題，QA 使用專案正式支援的 LTS Node，而非修改產品邏輯繞過。

**Rationale**: 測試已有 `module.register()` deprecation warning，可能來自 toolchain 與新 Node 版本組合。
# Final implementation decisions (2026-09-07)

- Upgraded Next.js and its ESLint config to 16.3.4 and NextAuth to 4.24.15. Prisma CLI and client remain on the same 6.19.x major/minor line.
- `npm audit --omit=dev` leaves four upstream/tooling findings (one low, three high). The suggested Prisma remediation is a backward version change and the esbuild advisory affects the development server; neither justifies a forced or cross-major production change in this pass.
- Required-slot and preference decisions now occur before model composition. Existing planner injection and deterministic fallback boundaries were retained instead of adding a second gateway/diagnostics abstraction.
- Confirmed legacy aliases are `/api/ai/plan-trip`, `/api/youtube/analyze`, and `/api/chat/message`; they now return deprecation and canonical successor metadata. The two revise endpoints have distinct semantics and were not falsely aliased.
- Place-photo protection is process-local (120 requests/minute per derived identity), validates width/reference input, uses a fixed Google origin, enforces a timeout, image MIME allowlist, and five-megabyte response ceiling. A distributed limiter remains a deployment-scale option.
- Public itinerary read/copy routes remain intentionally anonymous; private itinerary, collaboration, profile, and mutation routes retain session/resource authorization.
