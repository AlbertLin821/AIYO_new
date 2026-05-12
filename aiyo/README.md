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

3. Start Docker services from the `AIYO_new` root:

```bash
cd ..
docker compose up -d --build
```

Container names:

- `aiyo-new-app`
- `aiyo-new-postgres`
- `aiyo-new-redis`
- `aiyo-new-pgadmin`

The app container runs `prisma migrate deploy` before `next start`. You can verify app-to-database connectivity at `http://localhost:3000/api/health`.

4. Back in `AIYO_new/aiyo`, generate Prisma client, apply schema, and seed:

```bash
cd aiyo
npm run prisma:generate
npx prisma migrate deploy
npm run db:seed
```

If `prisma migrate deploy` fails, you can apply the migrations manually (in order):

```bash
npx prisma db execute --file prisma/migrations/20260416_000001_phase3_init/migration.sql --schema prisma/schema.prisma
npx prisma db execute --file prisma/migrations/20260416_000002_add_password_hash/migration.sql --schema prisma/schema.prisma
```

5. Start Ollama:

```bash
ollama serve
ollama pull gemma4:26B
ollama pull mistral-small:24b
ollama pull qwen3.6:27b
```

6. Start the app:

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
- `OLLAMA_BASE_URL` / **`OLLAMA_MODEL`** — 預設端點與後備模型；預設 `gemma4:26B`
- **`OLLAMA_VIDEO_SUMMARY_MODEL`** / **`OLLAMA_VIDEO_SUMMARY_FAST_MODEL`** / **`OLLAMA_VIDEO_SUMMARY_FINAL_MODEL`** — 影片摘要與段落 JSON 拋光（`video-moment-polish` 走 FINAL）；FAST 預設 `mistral-small:24b`，其餘預設與 `OLLAMA_MODEL` 同系
- **`OLLAMA_LOCATION_MODEL`** — `location-filter`（可選）；預設 `qwen3.6:27b`
- **`OLLAMA_TRIP_PLAN_MODEL`** — 僅行程 JSON（`trip-plan`／語音建行程）；未設則同 `OLLAMA_MODEL`。強結構化 JSON 可試 **IBM Granite 4.1**（如 `granite4.1:3b`），見 `docs/ollama-prompts.md`
- `OLLAMA_VIDEO_SEGMENT_JSON_POLISH` — defaults to `true`（影片段落 JSON 拋光，見 `docs/ollama-prompts.md`）
- `OLLAMA_VIDEO_LOCATION_JSON_FILTER` — defaults to `false`（可選地名 JSON 篩選）

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
- `/collaborate`（導向 `/itinerary`，舊書籤相容）

Compatibility routes retained:

- `POST /api/ai/plan-trip`
- `POST /api/youtube/analyze`

## Additional docs

- `../README.md`（儲存庫根目錄：啟動與 Docker 主說明）
- `../docs/README.md`（專案層 `docs/` 索引）
- `docs/README.md`（本目錄 `aiyo/docs/` 與 `testing/` 索引）
- `../docs/architecture.md`
- `../docs/implementation_report.md`
- `docs/phase3_production_upgrade_report.md`
