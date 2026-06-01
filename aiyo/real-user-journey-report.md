# AIYO Real New User Black-Box Journey Report

Test date: 2026-06-01

Scope: first-pass black-box journey only. The app was operated through the browser UI as a new user. Production code was not inspected before this report.

## 操作路徑

1. Opened `http://localhost:3000/`.
2. Observed home page navigation: 首頁, 地圖, AI 對話, 行程, 個人資料.
3. Clicked 個人資料, was redirected to login.
4. Switched to 建立帳號 and created a new email/password test account.
5. Completed welcome/onboarding with destination `東京` and `3` days.
6. Returned to home, searched `東京 旅遊 三天兩夜`.
7. Opened a YouTube result summary.
8. Used `加入地圖與行程` to import extracted places into a new itinerary.
9. Opened itinerary page, edited one item title, tried editing its time, deleted another item.
10. Opened map page from the itinerary, inspected marker popup, route links, itinerary panel, and deleted a map-panel item.
11. Opened AI chat and asked AI to arrange a Tokyo 3-day 2-night itinerary.
12. Confirmed preference reuse, answered the follow-up question card, and tried to nudge AI to continue.
13. Returned to itinerary, map, refreshed, and navigated back/forward to verify persistence and synchronization.

## 成功完成的功能

- New account creation completed through UI.
- Login/session redirected correctly to the requested profile page.
- Onboarding destination/day form accepted `東京` and `3`.
- Home page search eventually returned YouTube travel results.
- Video summary modal displayed timestamps, extracted places, and checkboxes.
- Extracted video places were eventually imported into itinerary and map.
- Itinerary page rendered imported places and persisted deletion across map/itinerary.
- Map page rendered markers, popup details, Google Maps links, route segments, and itinerary panel.
- Deleting an item from the map panel removed it from the itinerary after navigation.
- Itinerary persisted after direct navigation back to `/itinerary`.

## 卡住的地方

### P1 - AI question card flow stalls after answer

After asking AI to build a Tokyo 3-day 2-night trip, AI first asked whether to reuse previous preferences. After confirming reuse, AI displayed a question card: `這趟東京幾個人一起去？`

Selecting `自己一個人（獨旅）` and clicking `送出並繼續` added a user receipt message, but AI never continued to generate a plan after 45 seconds. Sending an additional text message `我是一個人，請直接繼續產生行程。` also did not trigger a response after 45 seconds.

User impact: a normal user cannot complete AI itinerary generation from the guided question card.

Suggested direction: ensure question-card submission resumes the same planning workflow, advances progress state out of `等你回覆`, and submits the accumulated answers back into the planner.

### P1 - Search button looks disabled after typing until Enter

On the home page, after filling the search box with `東京 旅遊 三天兩夜`, the button still appeared disabled in the accessibility snapshot, and results area changed to `尚未搜尋影片`. Pressing Enter then triggered search and enabled/populated results.

User impact: mouse/touch users may think search is unavailable.

Suggested direction: make the search button enable immediately when the query has non-whitespace text, and keep click/Enter behavior consistent.

### P2 - Video import appears stuck for a long time

After clicking `加入地圖與行程`, the `加入到` dialog initially showed `載入行程列表中…`, disabled controls, then later enabled. After clicking `確認加入`, the UI showed `正在保存地圖與行程…` with no progress or explanation for a long period. After waiting around 25 seconds, the app finally navigated to itinerary.

User impact: user may double-click, refresh, or assume the operation failed.

Suggested direction: add a visible progress state with timeout/retry/error affordance, and avoid blocking on slow geocoding/provider work when the itinerary can be created first.

### P2 - Repeated accessible names make controls ambiguous

Itinerary activity cards are themselves `role=button` and contain nested edit/delete buttons with the same accessible phrases. Examples:

- `編輯活動 銀座` resolved to the whole sortable card, the text edit area, and the icon edit button.
- `刪除活動 PLAVE快閃店` resolved to the card and the exact delete button.

User impact: screen reader and automation users get duplicate controls; keyboard focus order is unclear.

Suggested direction: avoid making the whole card a button when it contains buttons, or give the container a non-button role and use explicit drag handles.

### P2 - Editing time did not persist

In itinerary, editing `銀座` title to `銀座散步` persisted, but changing time from `13:00` to `13:30` did not persist. After saving, the card still displayed `13:00`.

User impact: schedule editing is unreliable.

Suggested direction: verify edit form state, time input naming, save payload, and update reconciliation.

### P2 - AI preference reuse is only text, not a clear confirmation UI

AI responded with text asking whether to reuse preferences:

`可以。我看到你之前比較偏好你之前的旅遊偏好路線，這次東京 3 天也要沿用這個方向嗎？...`

There was no obvious preference reuse panel or structured UI at that point. A question card appeared later for group size, not for preference reuse.

User impact: personalization is present but weakly surfaced; user cannot see what preferences are being reused.

Suggested direction: show a structured preference reuse confirmation UI or equivalent explicit panel with reusable preferences and continue/cancel choices.

### P3 - Onboarding destination textbox has placeholder but no accessible label

The onboarding destination field was visible, but selecting by label text failed because the input is exposed mainly through placeholder text.

User impact: weaker accessibility; screen reader users may get less context.

Suggested direction: connect the visible `目的地` label to the textbox.

### P3 - Console contains noisy dev/performance logs

Observed warnings/logs:

- Next.js LCP image warning for YouTube thumbnail: add `loading="eager"` for above-the-fold LCP image.
- Many `[frontend-debug] ... Object` logs for video search and background summary handling.
- Fast Refresh and React DevTools logs are expected in dev mode.

User impact: low in production, but noisy logs can hide real issues during QA.

Suggested direction: gate frontend-debug logs behind an explicit debug flag.

## 發現的 bug

| Severity | Issue | Reproduction | Expected |
| --- | --- | --- | --- |
| P1 | AI question card answer does not resume itinerary planning | Ask for 3D2N Tokyo plan, confirm preference reuse, answer group size, wait | AI continues planning and creates/suggests travel plan |
| P1 | Search button remains disabled after text input until Enter | Type travel query on home page | Search button is enabled and clickable |
| P2 | Video import save has long no-feedback wait | Add video places to new itinerary | Fast save or clear progress/retry state |
| P2 | Duplicate/nested button accessible names | Try edit/delete activity via accessible name | One clear target per control |
| P2 | Time edit does not persist | Edit activity time and save | Updated time appears in itinerary and map |
| P2 | Preference reuse lacks equivalent panel | Ask for trip with reusable preferences | Structured preference confirmation UI appears |
| P3 | Onboarding destination input label not bound | Use accessible label for destination textbox | Label selects/focuses input |

## UI/UX 不直覺處

- `加入地圖與行程` imports all checked places by default, including broad/noisy POI like `機場` and `PLAVE快閃店`; the resulting itinerary title became `機場 影片行程`, which is a poor default for a Tokyo trip.
- The itinerary created from a video became 3 days after onboarding, but all imported activities were placed on Day 1 and Days 2-3 were empty.
- AI progress panel stayed at `步驟 2／4：等你補充行程條件` even after the user submitted the requested answer.
- During reload/back navigation, one intermediate snapshot showed a confusing empty itinerary state before direct `/itinerary` navigation recovered the trip.

## AI 回覆不合理處

- AI phrase `我看到你之前比較偏好你之前的旅遊偏好路線` is repetitive and vague.
- AI asked to reuse preferences but did not show what those preferences were.
- After receiving the required question card answer, AI produced no next response or travel plan.

## API / console / network error

No fatal console error was shown in the browser log during the black-box pass. No direct network inspector was used. Browser logs did show:

- LCP image warning for YouTube thumbnails.
- Repeated frontend debug logs for video search state transitions.

## 建議修正方向

1. Fix AI question-card continuation so answer submission resumes planner execution and creates or updates an itinerary.
2. Restore/implement explicit preference reuse panel or equivalent structured confirmation UI before full itinerary planning.
3. Fix home video search button enablement for typed input.
4. Improve video-to-itinerary import flow: create itinerary quickly, run geocoding/provider enrichment in parallel/background, and show progress/errors.
5. Fix itinerary activity edit save payload so time changes persist.
6. Remove nested interactive button semantics from itinerary/map activity cards and expose distinct edit/delete/drag controls.
7. Bind onboarding form labels to inputs.
8. Reduce debug console noise outside explicit debug mode.

## 第二階段根因與修正紀錄

After the first-pass black-box report, production code was inspected and fixed.

### 修正完成

- AI preference reuse: the planner still selected `confirm_preferences`, but the UI only had transient workflow-rail state. The assistant reply now persists `preferenceConfirmation`, chat messages restore it from metadata, and the latest assistant message renders an inline preference reuse panel. Accepting reuse sends an explicit planning intent instead of a vague `沿用`.
- Question card policy: when destination and duration are known, the planner no longer blocks full itinerary generation just to ask optional companions/preferences/pace/transport/budget questions.
- Home search button: the input now updates search state on both `input` and `change`, so typed text immediately enables click search.
- Itinerary accessibility: sortable activity cards now use an explicit drag handle instead of making the whole card act like a nested button, reducing ambiguous edit/delete controls.
- Onboarding accessibility: destination/day labels are bound to their inputs.
- Video search/summary contamination: a default seed video and the searched E2E video shared the same `videoId`. The client merge logic reused default seed summary fields for a different searched title, which made the drawer show the wrong extracted places and skip summarize. Production merge now rejects default-seed processed fields when the incoming non-default search result has a conflicting title.
- Slow AI/full-flow timeout: the long timeout was not one single cause. The main full-flow failure was the E2E waiting for `/api/chat/message` while the product used `/api/trip/revise`; the revision endpoint returned successfully in about 22 seconds. Production timeouts were still tightened so slow Ollama compose/patch-intent calls fall back sooner.
- Trip sync no-op: video import and manual itinerary add used non-forced `flushTripSyncNow()`, which can no-op before the sync service is hydrated. These paths now force a flush so user edits persist reliably.

### 修正後驗證

- `npm test`: passed, 387 tests.
- `npm run build`: passed. Build still reports the existing Turbopack NFT-list warning from `next.config.ts -> preloadedDestinations -> videoRecommendationService`.
- `npm run test:e2e:phase7`: passed, 9/9. This includes preference reuse panel, conditional search for opening hours, no-search general travel advice, assistant itinerary actions, map focus, refresh persistence.
- `npx playwright test tests/e2e/apply-video-summary-to-trip.spec.ts --reporter=line`: passed. Verified video search summary, selected places, itinerary import, map pins, and reload persistence.
- `npx playwright test tests/e2e/itinerary-editor-flow.spec.ts --reporter=line`: passed. Verified itinerary edit/delete/reorder flow.
- `npx playwright test tests/e2e/full-user-travel-flow.spec.ts --reporter=line`: passed after fixing the endpoint wait. Runtime is still long at about 8.3 minutes because this single spec covers search, summary, map, import, editor persistence, chat revision, screenshots, and reloads.

### 驗證限制

- `npm run test:e2e` timed out after 10 minutes without useful per-test output.
- Running multiple Playwright commands in parallel caused test seed/global setup interference, including Prisma generate `EPERM` rename noise and transient login/itinerary seed failures. The same specs passed when run sequentially.
