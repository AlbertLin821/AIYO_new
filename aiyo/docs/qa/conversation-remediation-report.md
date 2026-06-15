# Conversation Remediation Report

Date: 2026-06-15

## Summary

Round 2 addressed the five scoped high-risk defects with deterministic regression coverage first, then minimal production fixes. Day-level action expansion, pronoun/coreference resolver, Live AI metrics, and broader multi-turn matrices remain intentionally out of scope for round 3.

## Defects

### FIX-01 Destructive Confirmation Guard

- Status: Fixed
- Root cause: destructive wording such as "第二天全部清空。" matched full-revision routing and could reach planner flows before any confirmation policy.
- Failing test: `src/server/ai/destructiveConfirmation.test.ts`, `src/lib/chat/workflowRailVisibility.test.ts`, existing Playwright no-mutation baseline.
- Modified files: `src/server/ai/destructiveConfirmation.ts`, `src/app/api/ai/chat/route.ts`, `src/app/api/trip/revise/route.ts`, `src/lib/chat/workflowRailVisibility.ts`.
- Fix design: route-level guard records pending confirmation by user/trip/target with TTL, returns no actions on first destructive message, cancels on cancel wording, and emits target remove actions only after explicit confirmation by the same user/trip.
- Verification command: `npx tsx --test src/server/ai/destructiveConfirmation.test.ts src/lib/chat/workflowRailVisibility.test.ts`; `npx playwright test tests/e2e/conversation --project=chromium`.
- Before/after behavior: before, day clear could route to trip revision/question card; after, first message asks confirmation and leaves API/DB/UI/refresh unchanged.
- Remaining risk: whole-trip delete execution is guarded at conversation route level, but broader first-class day/delete-trip action schema is still round 3 work.

### FIX-02 saveTripPayload Transaction

- Status: Fixed
- Root cause: trip metadata, days, items, and pins were written through separate Prisma calls outside one transaction.
- Failing test: `tests/integration/conversation/conversation-remediation.test.ts`.
- Modified files: `src/server/data/appStateService.ts`.
- Fix design: wrap trip upsert/create, delete old rows, create days, create items, create pins, and fresh reload in one `prisma.$transaction`.
- Verification command: `npx tsx --test tests/integration/conversation/conversation-remediation.test.ts`.
- Before/after behavior: before, injected mid-write failure was not handled atomically; after, rollback preserves original bootstrap snapshot at every injected failure point.
- Remaining risk: test-only injection option is deliberately narrow and not exposed through API.

### FIX-03 AssistantAction Idempotency

- Status: Fixed
- Root cause: `itinerary.add_item` generated random ids on each application, so retries/replays duplicated items.
- Failing test: `src/lib/assistantActions/applyAssistantActions.test.ts`.
- Modified files: `src/lib/assistantActions/applyAssistantActions.ts`, `src/app/chat/page.tsx`.
- Fix design: stable id key binds request/message id, action type, action index, and payload; replay returns `alreadyAppliedCount` and does not mutate.
- Verification command: `npx tsx --test src/lib/assistantActions/applyAssistantActions.test.ts`; `npm test`.
- Before/after behavior: before, same request replay added duplicates; after, same request/action is applied once while same-name items from different messages or different action indexes remain valid.
- Remaining risk: DB-level idempotency table was not added; this round covers the client executor replay path used by conversation actions.

### FIX-04 Partial Action Result Reporting

- Status: Fixed
- Root cause: executor only returned counts, and chat UI could look fully successful when some actions skipped/failed.
- Failing test: `src/lib/assistantActions/applyAssistantActions.test.ts`.
- Modified files: `src/lib/assistantActions/applyAssistantActions.ts`, `src/app/chat/page.tsx`.
- Fix design: executor returns structured `succeeded`, `skipped`, and `failed` entries with reasons; chat appends a visible summary when partial execution occurs.
- Verification command: `npx tsx --test src/lib/assistantActions/applyAssistantActions.test.ts`; `npm test`.
- Before/after behavior: before, one success plus one invalid day could be shown like full success; after, user sees which action failed and why.
- Remaining risk: legacy proposed-change partial reporting remains separate legacy path.

### FIX-05 Foreign Write 403

- Status: Fixed
- Root cause: `/api/trips/current` used a catch-all 500 handler for non-auth failures from ownership validation.
- Failing test: `tests/e2e/conversation/conversation-api.spec.ts`.
- Modified files: `src/app/api/trips/current/route.ts`.
- Fix design: use shared `toApiError` mapping for 401/403/404 and sanitized 500 fallback.
- Verification command: `npx playwright test tests/e2e/conversation/conversation-api.spec.ts --project=chromium`.
- Before/after behavior: before, foreign writes could surface as 500; after, foreign write returns 403 without stack trace, DB details, or foreign trip data.
- Remaining risk: other routes should be audited in round 3 for consistent mapping.

## Verification

- Passed: `npm test`
- Passed: `npx tsx --test tests/integration/conversation/conversation-baseline.test.ts`
- Passed: `npx tsx --test tests/integration/conversation/conversation-remediation.test.ts`
- Passed: `npx playwright test tests/e2e/conversation/conversation-api.spec.ts --project=chromium`
- Passed: `npx playwright test tests/e2e/conversation --project=chromium`
- Passed: `npm run build`
- Failed: `npm run lint` on pre-existing unrelated React compiler/lint issues outside modified files.

## Remaining Round 3 Work

- 5 complete multi-turn dialog groups.
- Pronoun/coreference resolver.
- Duplicate, cross-city, reorder full matrix.
- First-class day-level action support.
- Timeout, non-JSON, and complete fault-injection matrix.
- Live AI three-run metrics and quantified rates.
