# AIYO_new Architecture

## Repository Layout

- `AIYO_new/docs/`
  - migration and implementation documents
- `AIYO_new/aiyo/`
  - active Next.js app

## Application Structure

Inside `AIYO_new/aiyo/`:

- `src/app/`
  - App Router pages
  - route handlers in `src/app/api/*`
- `src/components/`
  - existing multi-page UI components
- `src/stores/`
  - Zustand stores for trip, map, video, and chat state
- `src/services/`
  - client-side fetch clients and itinerary-to-map helpers
- `src/server/ai/`
  - Ollama client
  - prompt builder
  - LLM response parser
- `src/server/services/`
  - travel planner service
  - video summary service
  - video recommendation service
- `src/types/`
  - shared request/response and domain schemas
- `src/lib/`
  - app-level utilities, mock seed data, API response helpers

## Runtime Flow

### 1. AI chat

- UI sends a message from:
  - `src/app/chat/page.tsx`
  - `src/components/map/FloatingAIChat.tsx`
- client fetches `POST /api/ai/chat`
- route handler calls `travelPlannerService.chat`
- service builds a travel-aware prompt
- `ollamaClient` calls the configured Ollama model
- parser normalizes the assistant reply into shared `ChatMessage` schema

### 2. Trip planning

- UI triggers planning from `src/components/map/VoicePlanningButton.tsx`
- client fetches `POST /api/ai/plan`
- route handler calls `travelPlannerService.generatePlan`
- prompt builder requests structured itinerary JSON
- response parser normalizes malformed or partial LLM output into stable `TripPlanResult`
- frontend writes plan days into `useTripStore`

### 3. Video summary and recommendation

- Home page search bar chooses one of two flows:
  - keyword -> `POST /api/videos/recommendations`
  - video URL -> `POST /api/videos/summarize`
- `videoRecommendationService` currently returns mock-friendly recommendations with a provider boundary ready for YouTube Data API
- `videoSummaryService` currently returns mock-friendly transcript summaries and extracted locations with a provider boundary ready for transcript APIs
- summary drawer can:
  - create itinerary items in `useTripStore`
  - create map pins in `useMapStore`

### 4. Itinerary to map sync

- itinerary lives in `useTripStore`
- explicit sync actions call `buildPinsFromTripPlan`
- pins are written into `useMapStore`
- `src/components/map/MapView.tsx` reads store-backed pins only
- no hardcoded pins remain in the rendered map flow

## API Surface

### Real Ollama-backed

- `POST /api/ai/chat`
- `POST /api/ai/plan`

### Mock-friendly service-backed

- `POST /api/videos/recommendations`
- `POST /api/videos/summarize`
- `POST /api/collab/join`
- `POST /api/map/geocode`

### Compatibility aliases retained

- `POST /api/ai/plan-trip`
- `POST /api/youtube/analyze`

## Shared Types

Key types now live in `src/types/index.ts`:

- `ChatMessage`
- `TravelPreferences`
- `TripPlanRequest`
- `TripPlanDay`
- `TripPlanItem`
- `MapPin`
- `VideoRecommendation`
- `VideoSummarySegment`
- `CollaborativeComment`
- `ApiSuccess<T>`
- `ApiError`

## Environment Variables

Defined in `aiyo/.env.example`:

- `OLLAMA_BASE_URL`
- `OLLAMA_MODEL`
- `OLLAMA_TIMEOUT_MS`
- `NEXT_PUBLIC_APP_NAME`
- `YOUTUBE_API_KEY`
- `GOOGLE_MAPS_API_KEY`
- `ENABLE_MOCK_VIDEO_PROVIDER`
- `ENABLE_MOCK_MAPS`

## Current Integration Status

### Real today

- Next.js BFF layer
- Ollama chat
- Ollama itinerary generation
- Itinerary store updates
- Map pin sync from itinerary and video summaries

### Mock but replaceable

- Video recommendations
- Transcript and summary extraction
- Geocoding
- Collaboration persistence/backend

## Extension Points

### YouTube

- replace internals of `src/server/services/videoRecommendationService.ts`
- replace internals of `src/server/services/videoSummaryService.ts`

### Maps

- replace map rendering in `src/components/map/MapView.tsx`
- upgrade geocode provider in `src/app/api/map/geocode/route.ts`

### Collaboration backend

- keep local types and UI
- add persistence/socket service behind current collaboration store and route boundaries
