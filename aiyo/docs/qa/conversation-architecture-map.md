# Conversation And Itinerary Architecture Map

Date: 2026-06-15

## Scope

This map covers the AI conversation path that can read memory, decide intent, emit AssistantActions, mutate itinerary state, persist to the database, refresh from bootstrap, and isolate user data.

## Primary Flow

```mermaid
flowchart TD
  U["User message in src/app/chat/page.tsx"] --> C["Client context: current trip, profile, chat history"]
  C --> R{"Client route choice"}
  R -->|normal/structured chat| AI["src/services/aiClient.ts -> POST /api/ai/chat"]
  R -->|full revision heuristic| TR["POST /api/trip/revise"]
  AI --> API["src/app/api/ai/chat/route.ts"]
  API --> MEM["memory retrieval + personal memory recall"]
  API --> CTX["buildPersonalizedAIContext"]
  CTX --> ORCH["travelAgentOrchestrator intent decision"]
  ORCH --> MODEL["travelPlannerService / model provider"]
  MODEL --> VAL["assistantActionValidator"]
  VAL --> DBMSG["ChatMessage persisted"]
  DBMSG --> UI["Assistant reply rendered"]
  UI --> ACT["applyAssistantActions"]
  ACT --> STORE["Zustand trip/map stores"]
  STORE --> SYNC["syncService.flushTripSyncNow"]
  SYNC --> PUT["PUT /api/trips/current"]
  PUT --> SAVE["saveTripPayload"]
  SAVE --> PRISMA["Trip, TripDay, TripItem, MapPin"]
  PRISMA --> BOOT["GET /api/bootstrap"]
  BOOT --> UI
```

## Data Boundaries

- Session identity comes from NextAuth and server routes use the session user id, not a request-supplied user id.
- Trip access is enforced by `requireTripAccess` for existing trip ids.
- Personalized context is built per user id and must not include another user's trips, profile, memory, or chat messages.
- Client AssistantActions mutate local trip/map state first, then persist through `/api/trips/current`.

## Baseline Coverage Added

- Integration fixture seeds isolated User A and User B with deterministic profile, trips, chat memory, and active trip data.
- Integration tests cover personalized AI context, User B isolation, AssistantAction validation, trip persistence, DB reload, and forbidden cross-user writes.
- Playwright tests cover chat action payload, UI itinerary, map markers, bootstrap refresh persistence, destructive confirmation with no action, and User B empty state isolation.

