# Browser QA Results

Date: 2026-09-07  
Browser: Chromium through `agent-browser` 0.34.0  
Target: `http://127.0.0.1:3000`

| Case | Result | Observation |
|---|---|---|
| B01 Home and navigation | PASS | Desktop and 390×844 layouts rendered; home, map, chat, itinerary, and profile navigation worked. |
| B02 Login and logout | PASS | Credential login succeeded, authenticated identity appeared, logout cleared the session. |
| B03 Unauthorized access | PASS | Direct `/itinerary` access after logout redirected to `/login?callbackUrl=%2Fitinerary`. |
| B04 Chat history/UI | PASS | Chat page loaded and accepted a new planning message. |
| B05 Required planning questions | PASS | `東京三天` first offered preference reuse, then rendered a structured question card without requiring a live model response. |
| B06 Provider-offline fallback | PASS | The deterministic preference/question flow remained usable with the local AI provider unavailable. Full fallback contracts also passed unit tests. |
| B07 Itinerary editing | PASS | Added `淺草寺` at 10:00 with location and notes; item persisted and publication became available. Full create/edit/reorder/delete persistence is covered by Phase 7 E2E. |
| B08 Map integration | PASS WITH ENV LIMIT | The three-day itinerary and added activity synchronized to the map panel. The app showed its no-marker fallback; Google reported `BillingNotEnabledMapError` for the supplied development key. |
| B09 Settings and profile | PASS | Settings tabs and profile loaded; inline name editing and Escape cancellation worked. |
| B10 Video discovery/summary | PASS | Recommended videos loaded; Taipei summary displayed embedded video, timestamps, extracted locations, and add-to-map action. |
| B11 Collaboration | PASS | Share dialog displayed invite link/code, owner, collaborator list, role selector, and guarded invite action. Permission/comment/presence mutations passed authenticated E2E. |
| B12 Publication | PASS | Publication control enabled after an activity existed. Anonymous snapshot, copy, revoke, and authorization behavior passed public-itinerary E2E. |
| B13 Responsive behavior | PASS | Home was usable at 390×844 with accessible bottom navigation and no blocking overlay. |
| B14 Keyboard/accessibility | PASS | Escape behavior was exercised for editable/modal state; WCAG 2 A/AA axe audit on the mobile home returned zero violations. |

## External limitations

- Live Google map tiles/markers cannot be accepted until billing is enabled for the development Google Maps project. The application fallback and itinerary-to-map synchronization were verified.
- Live AI-provider E2E was not run because no verified live provider configuration was available. Deterministic offline planner behavior and all non-live suites passed.

## Console observations

- No application exception was observed during the tested flows.
- The only third-party error was Google Maps `BillingNotEnabledMapError` described above.
