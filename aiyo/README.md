# AIYO App

This is the active application inside `AIYO_new/aiyo`. It now includes:

- Next.js BFF routes for AI, video, trip, profile, auth, and collaboration
- Ollama-backed chat and trip planning
- PostgreSQL + Prisma persistence
- NextAuth identity with Google OAuth + email/password credentials
- server-streamed collaboration snapshots and presence heartbeats

## Stack

- Next.js 16 App Router
- React 19
- TypeScript
- Zustand for UI state
- Prisma ORM with PostgreSQL
- NextAuth
- Ollama through server-side adapters and Next route handlers

## Local setup

1. Copy envs:

```bash
cp .env.example .env.local
```

Prisma CLI reads `.env` by default. If you run Prisma commands (migrate/seed) and see `Environment variable not found: DATABASE_URL`, create `.env` with `DATABASE_URL=...` or export the env var before running Prisma.

2. Install packages:

```bash
npm install
```

3. Start PostgreSQL. You can reuse the legacy compose file:

```bash
cd ../..
cd AIYO
docker compose -f docker-compose.yml up -d postgres
```

4. Create the dedicated database once:

```bash
docker exec aiyo-postgres psql -U aiyo -d postgres -c "CREATE DATABASE aiyo_new_db;"
```

5. Back in `AIYO_new/aiyo`, generate Prisma client, apply schema, and seed:

```bash
npm run prisma:generate
npx prisma migrate deploy
npm run db:seed
```

If `prisma migrate deploy` fails, you can apply the migrations manually (in order):

```bash
npx prisma db execute --file prisma/migrations/20260416_000001_phase3_init/migration.sql --schema prisma/schema.prisma
npx prisma db execute --file prisma/migrations/20260416_000002_add_password_hash/migration.sql --schema prisma/schema.prisma
```

6. Start Ollama:

```bash
ollama serve
ollama pull gemma3:4b
```

7. Start the app:

```bash
npm run dev
```

Open `http://localhost:3000`.

## Required env vars

- `DATABASE_URL`
- `NEXTAUTH_URL`
- `NEXTAUTH_SECRET`
- `OLLAMA_BASE_URL`
- `OLLAMA_MODEL`

Optional:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`

### Phase 3.5 (YouTube + Maps real data)

Set these for production-like behavior (see also `next.config.ts` for `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` mapping):

- `YOUTUBE_API_KEY` — YouTube Data API v3 (search + video metadata)
- `GOOGLE_MAPS_API_KEY` — server-side Geocoding API
- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` — browser Maps JavaScript API (same key is fine if APIs are enabled for it)
- `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID` — optional Map ID from Cloud Console (Map Management); enables vector map + `AdvancedMarkerElement`. If omitted, classic markers are used
- `OLLAMA_BASE_URL` / `OLLAMA_MODEL` — transcript summarization

Fallback switches (default `false`):

- `ENABLE_MOCK_VIDEO_PROVIDER` — force local mock video list instead of YouTube
- `ENABLE_MOCK_MAPS` — reserved; maps fallback is automatic when the client key or SDK fails

## Main directories

- `src/app/`: pages and route handlers
- `src/components/`: UI
- `src/stores/`: local UI and cached remote state
- `src/services/`: client-side fetch, sync, persistence, and mapping helpers
- `src/server/`: AI adapters, provider integrations, and data services
- `src/types/`: shared contracts
- `prisma/`: schema, migration, and seed

## Implemented routes

- `POST /api/ai/chat`
- `POST /api/ai/plan`
- `GET /api/bootstrap`
- `GET|PUT /api/profile`
- `GET|PUT /api/trips/current`
- `GET /api/collab/room`
- `POST /api/collab/comments`
- `POST /api/realtime/presence`
- `GET /api/realtime/stream`
- `POST /api/videos/summarize`
- `POST /api/videos/recommendations`

Protected routes:

- `/profile`
- `/itinerary`
- `/collaborate`

Compatibility routes retained:

- `POST /api/ai/plan-trip`
- `POST /api/youtube/analyze`

## Additional docs

- `../docs/architecture.md`
- `../docs/implementation_report.md`
- `docs/phase3_production_upgrade_report.md`
