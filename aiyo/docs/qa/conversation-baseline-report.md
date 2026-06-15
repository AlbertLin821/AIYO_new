# Conversation Baseline Report

Date: 2026-06-15

## Summary

Deterministic baseline tests now cover the conversation-to-itinerary path across context building, Action validation, DB persistence, UI update, map marker sync, refresh persistence, and User A/User B isolation.

## Fixtures

- User A: `qa-conversation-user-a@example.com`, password `ConversationTest123!`.
- User A preferences: Japanese food, ramen, traditional streets, temples/history, relaxed pace, public transport, medium budget, avoid overpacked days.
- User A history: Tokyo with 淺草寺/上野公園/東京晴空塔; Kyoto with 清水寺/伏見稻荷大社/嵐山.
- User A current trip: 東京四日遊 with four days and Day 4 blank.
- User B: `qa-conversation-user-b@example.com`, no User A profile/trip/chat data.

## Commands Run

```bash
npx tsx --test tests/integration/conversation/conversation-baseline.test.ts
npx playwright test tests/e2e/conversation/conversation-baseline.spec.ts --project=chromium
```

## Automated Results

| Suite | Passed | Failed | Blocked | Notes |
| --- | ---: | ---: | ---: | --- |
| Integration | 4 | 0 | 0 | Context, isolation, validation, persistence/access |
| API via Playwright request | 2 | 0 | 0 | Bootstrap/current-trip session scope, owned save, foreign write rejection |
| Playwright E2E | 3 | 0 | 0 | Add actions, destructive confirmation, User B isolation |
| Total deterministic baseline | 9 | 0 | 0 | Mocked AI harness; no live model metrics yet |

## Evidence

- Integration output: 4 tests passed in `tests/integration/conversation/conversation-baseline.test.ts`.
- API output: 2 Chromium request tests passed in `tests/e2e/conversation/conversation-api.spec.ts`.
- E2E output: 3 Chromium UI tests passed in `tests/e2e/conversation/conversation-baseline.spec.ts`.
- User B bootstrap and itinerary page showed zero User A trip identifiers or place names.
- Map evidence: Playwright found markers for 淺草寺 and 東京晴空塔 after assistant add actions.
- Refresh evidence: `/api/bootstrap` retained 淺草寺 and 東京晴空塔 after reload.

## Important Observations

- Remediation round 2 fixed the high-risk destructive confirmation gap for `/api/ai/chat` and `/api/trip/revise`: the first destructive message returns no mutation actions, and explicit confirmation is required before remove actions are emitted.
- `saveTripPayload` now wraps trip metadata, days, items, and pins in one Prisma transaction. Error-injection tests verify rollback after deleting old rows, after creating days, and after creating items.
- `applyAssistantActions` now uses stable request/action-index idempotency for assistant-created items and reports structured succeeded/skipped/failed action summaries.
- `/api/trips/current` now maps ownership failure to 403 and keeps unauthenticated access at 401.

## Not Tested Yet

- Live AI repeated runs, model name capture, hallucination rate, action correctness rate, memory correctness rate, state consistency rate, and flaky rate.
- Full multi-turn transcript groups.
- Most pronoun/coreference, duplicate, cross-city, day-level, and partial failure scenarios.

## Remediation Round 2 Results

```bash
npm test
npx tsx --test tests/integration/conversation/conversation-baseline.test.ts
npx tsx --test tests/integration/conversation/conversation-remediation.test.ts
npx playwright test tests/e2e/conversation --project=chromium
npm run build
```

All commands above passed. `npm run lint` was also run and failed only on pre-existing unrelated React compiler/lint findings in UI components outside this remediation scope.
