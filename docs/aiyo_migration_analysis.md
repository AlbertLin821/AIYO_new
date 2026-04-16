# AIYO -> AIYO_new Migration Analysis

## Scope

- Legacy reference: `AIYO/`
- Target implementation: `AIYO_new/aiyo/`
- Documentation output path requested by user: `AIYO_new/docs/`

## A. Project Structure Comparison

| Area | `AIYO/` | `AIYO_new/aiyo/` | Gap |
| --- | --- | --- | --- |
| Frontend framework | Next.js frontend in `frontend/` | Next.js 16 App Router in `src/app/` | New app already has the right frontend host |
| Routing | Split between frontend routes and separate gateway/api service | Pure App Router pages plus a few route handlers | New app lacks a complete BFF/backend layer |
| State management | Mixed frontend state plus backend persistence | Zustand-only local client stores | New app has good local UI state but no real server synchronization |
| UI components | Older production-oriented UI | New multi-page UI prototype with map/chat/itinerary/collaboration flows | Keep new UI, do not regress |
| API layer | Express `api-gateway` with auth, proxying, trace IDs, job endpoints | Only a few mock `src/app/api/*` route handlers | Need a lightweight BFF inside Next route handlers |
| Backend services | Python FastAPI `ai-service` with planner, Ollama chat, v2 router, request models | None beyond mock route handlers | Need server-side adapters inside Next |
| AI service | Ollama chat, planner, retrieval/reranking abstractions, model/env config | None beyond mock JSON response | Need reusable AI client and parsing layer |
| Data model | Request/response contracts in gateway + Pydantic models in AI service | Frontend types in `src/lib/types.ts`, mostly UI-driven | Need unified schemas shared by routes, services, and stores |
| Environment variables | `.env.example`, gateway config, AI service config, Docker compose | No `.env.example` in app, no shared config contract | Need explicit env contract for Ollama and feature flags |
| Startup flow | Multi-service local setup: frontend, gateway, ai-service, db, redis, compose | Single Next.js app | Keep single-app startup and absorb required backend responsibilities into Next |
| Docker/scripts | `docker-compose.yml`, service Dockerfiles, migration scripts | No compose/scripts for app root | New app should stay lightweight and document Ollama-first local startup |

### Legacy Architecture Notes Worth Reusing

- `AIYO/api-gateway/src/config.js` centralizes environment loading and defaults.
- `AIYO/api-gateway/src/v2Routes.js` normalizes trace IDs, validates response contracts, and proxies to backend services cleanly.
- `AIYO/ai-service/app/main.py` separates prompt building, Ollama invocation, request models, and fallback behavior.
- `AIYO/ai-service/app/planner.py` isolates itinerary planning constraints and normalized planner output.
- `AIYO/ai-service/app/v2_router.py` shows how recommendation and planning flows can stay contract-driven even when async jobs exist.

## B. Legacy Capabilities Worth Migrating

### Already present in `AIYO/` and missing in `AIYO_new/aiyo/`

1. Ollama-backed chat request flow with model/base-url configuration.
2. Structured itinerary generation pipeline with constraints and normalized day/slot output.
3. Clear AI service separation:
   - transport client
   - prompt construction
   - response parsing
   - planner/business logic
4. Standard request/response schema design for chat, planning, and recommendations.
5. Gateway/BFF pattern that keeps frontend fetch logic simple and hides provider details.
6. Environment-driven configuration:
   - `OLLAMA_BASE_URL`
   - `OLLAMA_MODEL`
   - timeout values
   - feature flags
7. Error handling and fallback behavior when upstream AI output is malformed.
8. Mock-to-real evolution path for recommendation/search/planning.
9. Traceable service modularization that can later host YouTube/Maps/Collab integrations.

### Useful patterns to adapt, not copy verbatim

- Do not port FastAPI or Express as-is into `AIYO_new`.
- Reuse the layering idea:
  - route handler -> service -> provider client -> parser
- Reuse planner normalization ideas, but reimplement them in TypeScript for single-app local development.
- Reuse mock-friendly contracts from `v2_router.py`, but skip job queues and database coupling for now.

## C. `AIYO_new/aiyo/` Current-State Audit

### Completed UI

- Home page with video search, video cards, and summary drawer.
- Map page with visual map view, itinerary side panel, floating AI chat, and voice-planning button.
- Itinerary page with editable list and local drag-reorder UI.
- Chat page with assistant-style conversation UI.
- Collaboration page with members, comments, and presence mockups.
- Profile page with editable preferences UI.
- Shared app shell/sidebar/onboarding flow already exists.

### UI-only or mock-driven areas

- `src/app/api/ai/plan-trip/route.ts` returns hardcoded plan data.
- `src/app/api/youtube/analyze/route.ts` returns mock video analysis only.
- `src/components/home/VideoSearchBar.tsx` does not fetch anything.
- `src/components/map/FloatingAIChat.tsx` only appends a delayed fake reply.
- `src/app/chat/page.tsx` uses local mock messages and local fake typing.
- `src/components/map/VoicePlanningButton.tsx` only simulates listening/processing.
- `src/components/map/ItineraryPanel.tsx` shows an add-item button that does not mutate state.
- `src/stores/useMapStore.ts` seeds pins from mock itinerary instead of syncing from actual user action.

### Store/flow mismatches

- `useTripStore` contains usable local itinerary editing methods, but no planner API integration.
- `useMapStore` is not driven by an itinerary-to-map sync contract.
- `useVideoStore` holds state but does not own fetch-backed search/summarize lifecycle.
- Chat data is duplicated in page-level state instead of shared application state.
- Collaboration is local-only, which is acceptable for now, but should be clearly framed as local/mock.

### Highest-priority fixes

1. Add a proper server-side Ollama adapter and planning service.
2. Replace mock API handlers with route handlers backed by services.
3. Connect chat UI and floating chat bubble to real `/api/ai/chat`.
4. Connect voice planning to `/api/ai/plan`.
5. Make video search call recommendation or summary endpoints.
6. Remove hardcoded map pins and sync map pins from itinerary store data.
7. Preserve local collaboration and reorder behavior, but make their state flows explicit.

## D. Migration Strategy

### Directly migrate

- Ollama configuration pattern.
- Service layering:
  - `ollamaClient`
  - `promptBuilder`
  - `responseParser`
  - domain services
- Planner normalization concept from legacy planner output.
- Gateway-style request normalization and safe error responses.

### Rewrite in TypeScript

- Chat, planning, and video service implementations.
- Planner schema and fallback parser.
- Route handlers as Next App Router BFF endpoints.
- Frontend fetch service layer and store integration.

Reason:

- `AIYO_new` should remain single-app and easy to run locally.
- Rewriting avoids dragging Python/Express dependencies into the new product shell.
- TypeScript services fit the existing Next.js runtime and reduce local setup burden.

### Keep mock-friendly for now

- Video recommendations:
  - mock data now
  - service contract ready for YouTube Data API later
- Video summary/transcript:
  - mock transcript and segment generation now
  - provider abstraction ready for transcript pipeline later
- Maps:
  - local map pin rendering now
  - schema ready for Google Maps SDK later
- Collaboration backend:
  - local Zustand behavior now
  - typed comment/member models ready for real backend later

### Explicitly out of scope in this migration

- Postgres persistence
- Redis/session history
- Auth/account system
- Real websocket collaboration backend
- RAG/vector search and database-backed retrieval
- Background job orchestration

Reason:

- They are not required for the user's requested local MVP.
- They would materially increase setup complexity.
- The new target should first stabilize a clean single-app BFF + Ollama architecture.

## Target Migration Plan

1. Introduce shared TypeScript contracts under `src/types/`.
2. Add `src/server/ai/*` and `src/server/services/*`.
3. Add new route handlers:
   - `/api/ai/chat`
   - `/api/ai/plan`
   - `/api/videos/recommendations`
   - `/api/videos/summarize`
4. Add client fetch services under `src/services/`.
5. Refactor Zustand stores to use the unified schema.
6. Connect Home, Chat, Map, and Itinerary pages to the new APIs and shared stores.
7. Replace hardcoded map pin behavior with itinerary-driven sync.
8. Add `.env.example`, architecture docs, and implementation report.

## Expected Post-Migration Result

- `AIYO_new/aiyo` remains a Next.js app with the existing UI/UX intact.
- Ollama becomes the default local AI provider through server-side route handlers.
- Chat and trip planning work end-to-end without a separate Python service.
- Video features are fetch-backed and mock-friendly.
- Itinerary and map stores are connected through a consistent data contract.
- Future YouTube, Maps, and collaboration backends can plug into the new service boundaries cleanly.
