# AIYO_new Implementation Report

## Core Difference: AIYO vs AIYO_new

- `AIYO/` is a multi-service implementation with a clearer backend and AI stack already in place.
- `AIYO_new/aiyo/` started as a stronger multi-page frontend prototype with limited backend behavior.
- This migration kept the `AIYO_new` product UI, but imported the legacy system's architectural ideas:
  - provider abstraction
  - BFF routing
  - service separation
  - prompt construction
  - normalized parsing
  - environment-driven configuration

## What Was Migrated

### Directly migrated as architecture

- Ollama configuration pattern
- service layering between route handlers, domain services, provider client, and parser
- structured itinerary generation approach
- safe fallback behavior for malformed AI output

### Rewritten for the new app

- all Next.js route handlers
- all server-side services in TypeScript
- shared request/response contracts
- client fetch service layer
- page/store integration for chat, planning, video, itinerary, and map flows

## New Server-Side Pieces

Added under `AIYO_new/aiyo/src/server/`:

- `ai/ollamaClient.ts`
- `ai/promptBuilder.ts`
- `ai/responseParser.ts`
- `services/travelPlannerService.ts`
- `services/videoSummaryService.ts`
- `services/videoRecommendationService.ts`

## New API Endpoints

- `POST /api/ai/chat`
- `POST /api/ai/plan`
- `POST /api/videos/recommendations`
- `POST /api/videos/summarize`

Compatibility paths preserved:

- `POST /api/ai/plan-trip`
- `POST /api/youtube/analyze`

## Data Flows Completed

### Chat

- Home-independent chat page and floating map chat both call the same `POST /api/ai/chat`.
- Shared chat state now lives in `useChatStore`.

### Itinerary

- AI planner generates a normalized trip plan.
- Voice planning flow writes generated days into `useTripStore`.
- Manual add activity actions also write into `useTripStore`.
- Reorder support remains local-state capable through the itinerary page/store hooks.

### Map

- Map pins are no longer hardcoded in the rendered map flow.
- Sync actions convert itinerary items or extracted video locations into `MapPin[]`.
- `MapView` renders pins from `useMapStore`.

### Video

- keyword search calls the recommendation service
- URL input calls the summary service
- summary drawer can create itinerary days and map pins from extracted locations

## What Remains Mock

- video recommendation provider
- transcript retrieval and summarization provider
- geocoding provider
- collaboration backend persistence and realtime transport

These were intentionally left behind service boundaries so they can be replaced without reworking page components.

## Validation Performed

- `npm run lint`
- `npx tsc --noEmit`
- `npm run build`

All three passed after the migration changes.

## Known Gaps / Next Steps

1. Replace mock video recommendation data with YouTube Data API integration.
2. Replace mock summary pipeline with transcript ingestion plus chunked summarization.
3. Swap the map mock renderer for Google Maps or Mapbox while keeping `MapPin` contracts.
4. Add persistence for itinerary/chat/collaboration state.
5. Add auth and multi-user collaboration transport if the product scope requires it.

## Issues Encountered

### Issue

- Next.js production build initially failed in the sandbox with Windows `spawn EPERM`.

### Cause

- the sandboxed environment blocked worker process spawning during `next build`

### Temporary fix

- run `npm run build` outside the sandbox for verification

### Proper fix

- none required in app code; the project builds successfully when worker spawning is permitted
