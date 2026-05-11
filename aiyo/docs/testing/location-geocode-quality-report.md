# Location / Geocode Quality Report

Date: 2026-05-10

## Scope

This round focused on real-data quality stabilization without UI redesign or broad refactoring:

- location mention cleaning
- geocode confidence gate
- description fallback timestamp confidence
- YouTube search cache and summary cache keys
- AI chat structured proposed changes with user-confirmed apply

## Fix Summary

| Area | Result |
|------|--------|
| Mention cleaning | Added `cleanPlaceMentionName` and routed extractor/normalizer through it. |
| Generic leakage | Generic remainders such as `夜市`, `美食`, `飯店`, `附近`, `市區` are rejected after cleaning. |
| Sentence fragments | Verb-led fragments such as `走路就能逛夜市` and `等晚上回飯店` are rejected. |
| Real POI names | Store/place names such as `郭家火雞肉飯`, `民主火雞肉飯`, `林聰明砂鍋魚頭`, `文化路夜市`, `旺來山鳳梨文化園區`, `檜意森活村`, `北門驛` are preserved. |
| Geocode gate | City-level Google results are no longer accepted merely because lat/lng exists. |
| Debug fields | `rawMention`, `cleanedName`, `geocodeConfidence`, `geocodeMatchReason`, `geocodeRejectedReason` added to location references. |

## Cleaning Examples

| Raw mention | Cleaned / decision |
|-------------|--------------------|
| `晚上來到文化路夜市` | `文化路夜市` |
| `接著來到旺來山鳳梨文化園區` | `旺來山鳳梨文化園區` |
| `及郭家火雞肉飯` | `郭家火雞肉飯` |
| `然後去檜意森活村` | `檜意森活村` |
| `走路就能逛夜市` | rejected, sentence-only generic phrase |
| `等晚上回飯店` | rejected, generic/sentence phrase |
| `這邊附近很多美食` | rejected, sentence-only generic phrase |

## Geocode Accepted / Rejected Examples

| Candidate | Google shape | Decision |
|-----------|--------------|----------|
| `郭家火雞肉飯` | `restaurant`, `food`, `point_of_interest`, `establishment` | accepted |
| `文化路夜市` | POI-like result with place evidence | accepted |
| `旺來山鳳梨文化園區` mapped only to `Chiayi City, Taiwan 600` | `locality`, `political` only | rejected |
| sentence-like raw mention with low confidence | weak similarity or city-level evidence | rejected |

## Description Fallback

Description fallback now splits lines/sentences before extraction and filters CTA/noise lines. Entries created from description include:

- `timestampSource: "description-fallback"`
- `timestampConfidence: "low"`

The drawer displays these as `描述提及` instead of presenting them as precise jump timestamps.

## Cache

| Cache | Key contents | Result |
|-------|--------------|--------|
| YouTube search | pipeline version, destination, query, language, limit | `youtubeSearchCache.test.ts` verifies same query is a memory hit and avoids repeated API calls. |
| Video summary | pipeline version, videoId, destination, language | persisted cache no longer keys only by videoId. |

Live tests now use artifact replay unless `LIVE_API=1` is explicitly set.

## Verification

| Command | Result |
|---------|--------|
| `npm test` | Pass, 58/58 |
| `npm run lint` | Pass with 1 existing warning in `tests/e2e/itinerary-editor-flow.spec.ts` |
| `npm run build` | Pass |
| `npm run e2e:full-qa` | Pass, 3/3 |
| `npx playwright test --trace on` | Pass, 23/23 |

## Remaining Limitations

- This round did not migrate Google Maps to `AdvancedMarkerElement`; tracked in `docs/testing/google-maps-technical-debt.md`.
- Existing live artifacts may still include older pre-fix raw examples if replayed without `LIVE_API=1`; new unit/e2e tests validate the fixed behavior deterministically.
- Google Maps referrer allowlist still needs external console configuration for `localhost:3101`, `localhost:3000`, and future deployment domains.
