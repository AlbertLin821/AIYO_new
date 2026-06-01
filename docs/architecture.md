# AIYO_new Architecture

## Repository Layout

- `AIYO_new/docs/` — migration and implementation documents
- `AIYO_new/aiyo/` — active Next.js 16 app (product)
- `AIYO_new/aiyo/src/components/chat/skyDash/` — in-chat Sky Dash mini-game UI (canonical implementation)
- `AIYO_new/docker-compose.yml` — Postgres, Redis (reserved), SearXNG, optional Mem0

## Application Structure

Inside `AIYO_new/aiyo/`:

- `src/app/` — App Router pages and `src/app/api/*` route handlers
- `src/components/` — UI (chat, map, itinerary, home)
- `src/stores/` — Zustand (trip, map, chat, collab, video)
- `src/services/` — client API clients, `syncService`, `mapSync`, geocode helpers
- `src/server/` — server-only domain logic (AI, data, geo, video)
- `src/types/` — shared domain types
- `src/lib/` — utilities, auth, Prisma client
- `src/proxy.ts` — auth gate for `/chat`, `/itinerary`, `/map`, `/profile`

## Runtime Flow

### 1. AI chat

- UI: `src/app/chat/page.tsx`
- Client: `POST /api/ai/chat` via `src/services/aiClient.ts`
- Server: `travelPlannerService.chatWithTravelAssistant` (routing: inquiry → patch → structured workflow → research chat)
- Progress: `POST /api/chat/stream/register` then SSE `GET /api/chat/stream/[sessionId]`
- Persistence: `ChatMessage` rows with optional `metadata` JSON for structured payloads (`travelPlan`, `questionCard`, `proposedChanges`, etc.)

### 2. Trip planning

- Structured flow: questionnaire in chat → `generateTripPlan` → `travel_plan` card + `itinerarySuggestion`
- Direct plan: `POST /api/ai/plan` (saves trip + pins server-side)
- Full revision: `POST /api/trip/revise` or alias `POST /api/trips/revise`
- Client applies plans via `useTripStore`; `AppDataBridge` runs `reconcileTripMapState`

### 3. Video summary and recommendation

- `POST /api/videos/recommendations`, `POST /api/videos/summarize` (auth required)
- Pipeline: transcript → Ollama extraction → geocode → itinerary / map pins

### 4. Sync

- Bootstrap: `GET /api/bootstrap` hydrates stores
- Trip writes: debounced `PUT /api/trips/current`
- Realtime: SSE `GET /api/realtime/stream` for collaboration

## API Surface (selected)

| Route | Auth | Notes |
|-------|------|--------|
| `POST /api/ai/chat` | Soft (persist if logged in) | Main assistant |
| `POST /api/ai/plan` | Required | Direct itinerary generation |
| `POST /api/trip/revise`, `/api/trips/revise` | Required | Full replan |
| `POST /api/videos/summarize` | Required | |
| `POST /api/search/web` | Required | |
| `POST /api/map/geocode` | Required | |
| `GET /api/chat/stream/[sessionId]` | Required | Owner-bound session |

## Environment

- Local npm: prefer `aiyo/.env` (see root README); Prisma reads `.env`
- Docker: `aiyo/.env` via compose `env_file`
- `MEM0_ENABLED` defaults to `true` in `server/config.ts` (disable if Mem0 profile not used)
- Redis is started in Compose for future use; app code does not connect yet

## Chat progress storage

In-process `chatProgressStore` with per-user session ownership. Multi-instance deployments should add Redis (or sticky sessions) before scaling horizontally.
