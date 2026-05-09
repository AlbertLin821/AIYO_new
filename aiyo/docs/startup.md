# Local Startup Guide (AIYO_new/aiyo)

This document describes how to run the app locally with:

- Next.js (frontend + BFF routes)
- PostgreSQL + Prisma (persistence)
- NextAuth (identity)
- Ollama (LLM)

## Prerequisites

- Node.js + npm (project uses `package-lock.json`)
- Docker Desktop (for PostgreSQL)
- Ollama installed

## 1) Environment variables

Create `.env.local` from `.env.example`:

```bash
cp .env.example .env.local
```

Prisma CLI reads environment variables from `.env` by default (not `.env.local`). For local dev, either:

- create `.env` with at least `DATABASE_URL`, or
- export `DATABASE_URL` when running Prisma commands

Required (minimum):

- `DATABASE_URL` (example uses the local docker postgres in `AIYO/docker-compose.yml`)
- `NEXTAUTH_URL` (usually `http://localhost:3000`)
- `NEXTAUTH_SECRET` (generate a long random string)
- `OLLAMA_BASE_URL` (usually `http://localhost:11434`)
- `OLLAMA_MODEL` (default: `gemma4:26B`)
- `OLLAMA_VIDEO_SUMMARY_FAST_MODEL` (default: `mistral-small:24b`)
- `OLLAMA_VIDEO_SUMMARY_FINAL_MODEL` (default: `gemma4:26B`)
- `OLLAMA_LOCATION_MODEL` (default: `qwen3.6:27b`)

Optional:

- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (Google login)
- `YOUTUBE_API_KEY` (YouTube metadata/search)
- `GOOGLE_MAPS_API_KEY` (real map mode)

## 2) Install dependencies

From `AIYO_new/aiyo`:

```bash
npm install
```

## 3) Start PostgreSQL (Docker)

This repo already has a working local Postgres compose in the legacy project folder.

From `AIYO/`:

```bash
docker compose -f docker-compose.yml up -d postgres
```

Create a dedicated database for the new app (run once):

```bash
docker exec aiyo-postgres psql -U aiyo -d postgres -c "CREATE DATABASE aiyo_new_db;"
```

Set `.env.local`:

```env
DATABASE_URL=postgresql://aiyo:aiyo_password@localhost:5432/aiyo_new_db?schema=public
```

## 4) Prisma: generate, migrate, seed

From `AIYO_new/aiyo`:

```bash
npm run prisma:generate
npx prisma migrate deploy
npm run db:seed
```

Notes:

- If you point `DATABASE_URL` to a database that already has legacy tables, migrations will conflict.
- Use the dedicated `aiyo_new_db` database for a clean Prisma-managed schema.
- If `prisma migrate deploy` fails for any reason, you can apply the initial migration SQL directly:

```bash
npx prisma db execute --file prisma/migrations/20260416_000001_phase3_init/migration.sql --schema prisma/schema.prisma
```

Then apply the password migration:

```bash
npx prisma db execute --file prisma/migrations/20260416_000002_add_password_hash/migration.sql --schema prisma/schema.prisma
```

## 5) Start Ollama

In a separate terminal:

```bash
ollama serve
ollama pull qwen3.5:9b
```

## 6) Start the app

From `AIYO_new/aiyo`:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

## 7) Smoke checks

### Auth

- Visit `/profile` while signed out -> should redirect to `/login`
- On `/login`, use:
  - Google login (if configured), or
  - Email + password login (after registering)

Google OAuth callback URL (configure in Google Cloud Console):

```text
http://localhost:3000/api/auth/callback/google
```

### Persistence

- Update `/profile`, refresh page -> values should persist
- Edit `/itinerary`, refresh -> itinerary should persist

### Collaboration (realtime)

- Open two windows signed into the same user
- In window A, edit itinerary or add a comment on `/collaborate`
- Window B should reflect changes after the next snapshot tick

## Troubleshooting

### Prisma engine / CLI issues

- Run `npm run prisma:generate` first.
- Ensure `.env.local` has a valid `DATABASE_URL`.

### 401 from API routes

- You are not signed in, or `NEXTAUTH_SECRET` / `NEXTAUTH_URL` is missing.

### Chat/Plan fails

- Ensure Ollama is running and `OLLAMA_BASE_URL` is correct.
- Ensure the model in `OLLAMA_MODEL` is pulled.
