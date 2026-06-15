# Conversation Baseline Test Matrix

Date: 2026-06-15

Legend: Pass = automated in this baseline, Gap = product support or coverage gap found, Pending = not automated in first baseline.

| Area | Requested examples | Baseline status | Evidence |
| --- | --- | --- | --- |
| User A/User B fixture | Isolated users, User A profile/history/current trip, User B empty | Pass | `tests/integration/conversation/fixtures.ts` |
| Memory and personalization context | "我之前去過哪裡？", "我以前去過東京嗎？", avoid Osaka/favorite restaurant hallucination | Partial Pass | Integration verifies context includes Tokyo/Kyoto/preferences and excludes Osaka/favorite restaurant |
| User B memory isolation | User B must not see User A trips/preferences/chat | Pass | Integration context test and Playwright bootstrap/UI test |
| Add itinerary items | "在第二天加入淺草寺和晴空塔。" | Pass | Playwright verifies two actions, UI, DB/bootstrap, map markers, refresh |
| Add ambiguous item | "加入一個景點。" | Pending | Needs deterministic AI/action expectation |
| Cross-city add | "在東京行程加入大阪城。" | Pending | Needs confirmation/risk policy |
| Duplicate add | "再加入一次淺草寺。" | Pending | Needs duplicate detection/idempotency policy |
| Modify time | "把第二天的晴空塔改到下午三點。" | Pending | Harness supports it, but not yet asserted in final E2E |
| Pronoun/coreference | "把它移到第三天。", "剛剛加入的", "第二個" | Gap | No deterministic resolver layer identified |
| Reorder | "把第二個景點往前移。", "依移動距離重新排序。" | Pending | Existing `itinerary.reorder_items` requires exact item ids |
| Destructive clear | "第二天全部清空。" | Pass with harness, Gap in live route | E2E asserts confirmation/no DB change; live route observation showed `/api/trip/revise` risk |
| Day-level operations | add/delete/swap/move days, replace day | Gap | Current action schema lacks explicit insert/delete/swap/move day actions |
| Multi-turn dialogs | 5 groups of 5-10 turns | Pending | Requires larger scenario harness and transcript oracle |
| API error handling | timeout, non-JSON, validation error, executor failure, API 500 | Pending | Existing suites cover some structured cases, not this baseline matrix |
| API session scope | `/api/bootstrap`, `/api/trips/current` with User A/User B sessions | Pass, status Gap | API tests verify isolation and rejected foreign writes; forbidden write currently may surface as 500 |
| Security | foreign trip/item, dangerous text, userId tampering | Partial Pass | Integration validator/access tests cover foreign trip and dangerous text |
| Persistence consistency | UI/API/DB/map/refresh match | Pass | Playwright multi-add and integration persistence |
| Live AI metrics | 3 runs, model name, hallucination/action/memory/flaky rates | Pending | Not run in first deterministic baseline |
