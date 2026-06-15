# Conversation Capability Gaps

Date: 2026-06-15

## High Priority

1. Destructive command policy is now enforced before the covered planner routes.
   - Status: Fixed in remediation round 2 for `/api/ai/chat` and `/api/trip/revise`.
   - Evidence: deterministic tests verify "第二天全部清空。" emits no mutation before confirmation, cancellation emits no mutation, and explicit confirmation emits only target-day remove actions.

2. Trip persistence is atomic.
   - Status: Fixed in remediation round 2.
   - Evidence: `saveTripPayload` uses a single Prisma transaction for metadata, days, items, and pins; error-injection tests verify rollback at three stages.

3. AssistantAction replay/idempotency now covers assistant add actions.
   - Status: Fixed in remediation round 2 for client executor retries/refresh replays using request id plus action index.
   - Evidence: unit tests cover same request replay, same-name different message, same-message multiple same-name actions, and partial summary.

## Medium Priority

4. Day-level operations are not first-class.
   - Missing: insert day, delete day, swap day, move day, clear day with confirmation.

5. Pronoun and ordinal resolution are not deterministic.
   - Risk cases: "它", "剛剛加入的", "第二個", "那個".

6. Partial action failure is now surfaced for AssistantActions.
   - Status: Fixed in remediation round 2.
   - Evidence: executor returns structured succeeded/skipped/failed entries and chat appends a user-visible summary when any action is skipped or failed.

7. Live AI quality metrics are not established.
   - Missing: model name, 3-run repeatability, hallucination rate, memory correctness rate, action correctness rate, state consistency rate, flaky rate.

8. Forbidden trip API writes return a precise forbidden status.
   - Status: Fixed in remediation round 2.
   - Evidence: Playwright API test now requires 403 and verifies no stack trace, DB details, or foreign data in the response.

## Lower Priority

9. User B empty-state onboarding can cover itinerary assertions.
   - Test impact: E2E must dismiss onboarding before inspecting the empty itinerary page.
