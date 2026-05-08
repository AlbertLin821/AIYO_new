# AIYO QA Validation Report

Date: 2026-05-09

## Scope

This pass validated the AIYO travel planning website across:

- Static quality checks
- First-time login and onboarding flow
- Homepage default and searched video recommendations
- YouTube description cleanup
- Transcript-grounded location extraction
- Generated itinerary data shape
- Map pin synchronization and marker detail display
- Map loading/fallback behavior
- Itinerary panel manual activity editing
- Navigation/auth/collaboration smoke coverage

## Commands Run

```bash
npm run lint
npm run build
npm test
PLAYWRIGHT_PORT=3001 PLAYWRIGHT_BASE_URL=http://localhost:3001 npm run e2e
```

Notes:

- Port `3000` was occupied by the Docker-hosted app, so Playwright was run against `3001` using the new config override.
- `.next/dev` was cleared before the final e2e pass because a stale Next dev cache produced client manifest errors.

## Results

| Check | Result |
| --- | --- |
| ESLint | Passed |
| Production build / TypeScript | Passed |
| Unit tests | Passed: 29 |
| Playwright e2e | Passed: 13, Skipped: 2 |

## Scenarios Executed

### First-Time User Flow

Passed:

- Unauthenticated `/` redirects to `/login`.
- After credential login, onboarding appears.
- Onboarding contains destination and travel-days inputs.
- Onboarding supports `稍後再設定`.
- Onboarding does not render recommendation video cards or a recommendation section.
- After skipping onboarding, the homepage recommendation block renders six default Taiwan-city videos.
- No `/api/videos/recommendations` request is made for the empty skipped onboarding state.

### Homepage Video Recommendations

Passed:

- Empty state renders six local Taiwan-city recommendations covering 台北、新北、桃園、台中、台南、高雄.
- Default video objects match the `VideoRecommendation` contract.
- Search UI updates cards from a mocked YouTube recommendation API response.
- Card summary displays cleaned useful description text, not URL/hashtag/subscribe CTA noise.

### YouTube Summary And Location Extraction

Passed:

- `cleanYouTubeDescription` removes URLs, subscribe/share prompts, excessive hashtags, contact email, and chapter noise.
- Fixture transcript for 嘉義 food travel extracts concrete POIs and foods:
  - 阿宏師火雞肉飯
  - 林聰明砂鍋魚頭
  - 文化路夜市
  - 嘉義公園
- Generic destination/search terms are filtered:
  - 嘉義
  - 嘉義市
  - 嘉義美食
- Timestamped summary-segment fixture validates required fields: timestamp, startSeconds, endSeconds, title, text, highlights, locationHints.

### Itinerary Data Validation

Passed:

- Fixture itinerary for 嘉義 2 days validates:
  - summary exists
  - days length equals requested days
  - dayNumber is sequential
  - each day has 4 items
  - item times are chronological
  - item type is from the allowed enum
  - locations have finite lat/lng and are not generic destination-only stops

### Map Synchronization

Passed:

- `buildPinsFromLocations` preserves address, placeId, thumbnail, openingHours, phoneNumber, verification, confidence.
- `buildPinsFromTripPlan` links pins to itinerary items with `linkedTripItemId` and `dayNumber`.
- `mergeTripItineraryPins` preserves non-itinerary pins and rebuilds itinerary pins.
- E2E map flow verifies:
  - map page does not show onboarding
  - old permanent `正在載入 Google 地圖` overlay is absent
  - marker panel is visible
  - seeded itinerary pin is selectable
  - selected pin card shows name, address, opening hours fallback, phone fallback, and Google Maps route link

### Itinerary Panel Manual Activity

Passed:

- Map itinerary panel button text is `新增活動`.
- Clicking it adds a manual activity.
- The manual activity title can be edited inline.
- The edited title is visible in local UI state.

### Navigation/Auth/Collaboration Smoke

Passed:

- Protected itinerary access redirects to login.
- Mobile login form works at 390px.
- Folder management flow works.
- Itinerary add/delete flow works.
- Collaboration permissions flow works.
- Legacy `/collaborate` route redirects through protected itinerary flow.

## Bugs Found And Fixes Applied

1. Chinese POI extraction included speech prefixes.
   - Example bad extraction: `第一站是阿宏師火雞肉飯`
   - Fix: strip common Chinese travel narration prefixes before accepting POI candidates in `extractLocations`.

2. Fallback selected map-pin card did not expose all marker detail requirements.
   - Fix: added thumbnail/fallback area and Google Maps route planning link to the selected pin card.

3. Manual activity edit input could be treated as disabled by accessibility tooling.
   - Cause: parent row kept `aria-disabled=true` while the inline input was active.
   - Fix: do not mark the row disabled while title editing is active.

4. Playwright tests could hit stale Docker-hosted app on port 3000.
   - Fix: Playwright config now supports `PLAYWRIGHT_PORT` and `PLAYWRIGHT_BASE_URL`.

5. Login helper was flaky during dev-server reloads.
   - Fix: credential login helper retries by clicking the visible submit button if Enter submit does not navigate.

6. Optional Mem0/Ollama e2e tests failed when external services were unavailable.
   - Fix: tests now skip with explicit reasons when Mem0 persistence or AI planning service is not available.

## Skipped Checks

The final e2e run skipped two optional external-service tests:

- AI memory CRUD: skipped because Mem0 memory service was not available/persisting in this environment.
- Full AI planning + live YouTube summary + map pins workflow: skipped because `/api/ai/plan` returned non-200 in this environment, indicating Ollama/planning dependency unavailable.

These are environment blockers, not verified product passes.

## Remaining Risks

- Live YouTube Data API quality was not verified against the real API key; recommendation search was validated with mocked e2e data and unit-level cleaning tests.
- Live YouTube transcript fetching was not verified against a real video in the final e2e suite; transcript/location behavior is covered by fixture-based unit tests.
- Live Google Places details depend on enabled API permissions; missing opening hours/phone/thumbnail correctly fall back to `尚未提供`.
- Google Maps JS loaded in this environment and emitted the standard legacy marker deprecation warning. This is not a functional failure, but AdvancedMarker migration remains a future improvement when Map ID support is fully configured.
- Next dev on Windows emitted Watchpack warnings for system files such as `C:\pagefile.sys`; these did not fail the final e2e run.

## Suggested Next Steps

1. Run the skipped Mem0/Ollama/YouTube e2e flows in a staging environment with those services and API keys enabled.
2. Add a stable mocked `/api/videos/summarize` e2e path so summary drawer location-to-itinerary flow can be fully validated without live YouTube.
3. Add visual regression screenshots for the map selected-pin card and onboarding modal after the current flow stabilizes.
4. Migrate Google Maps markers to `AdvancedMarkerElement` when a valid `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID` is consistently available.

