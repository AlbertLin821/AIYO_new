# AIYO_new

`AIYO_new` is the current working repository for the AIYO application.
The active app lives in `aiyo/`, and the root folder provides shared docs plus the local Docker setup used for team development.

## Repository layout

- `aiyo/`: main Next.js application, Prisma schema, seed scripts, and app-level docs
- `docs/`: architecture notes, migration notes, implementation reports, and Docker migration guidance
- `docker-compose.yml`: local development services for this repo

## Stack

- Next.js 16 App Router
- React 19
- TypeScript
- Prisma + PostgreSQL
- NextAuth
- Ollama

## Team quick start

### 1. Prerequisites

Install these on your machine first:

- Node.js 20+
- npm
- Docker Desktop
- Ollama

### 2. Start PostgreSQL

From the repository root:

```bash
docker compose up -d postgres
```

If you also want the optional local tools:

```bash
docker compose up -d
```

This repo's compose file creates the development database `aiyo_new_db` automatically.

### 3. Configure the app

Move into the app directory and create local env files:

```bash
cd aiyo
cp .env.example .env.local
```

If Prisma commands cannot see `DATABASE_URL`, also create `.env` with the same database connection string as `.env.local`.

Default local database URL:

```env
DATABASE_URL=postgresql://aiyo:aiyo_password@localhost:5432/aiyo_new_db?schema=public
```

Required environment variables:

- `DATABASE_URL`
- `NEXTAUTH_URL`
- `NEXTAUTH_SECRET`
- `OLLAMA_BASE_URL`
- `OLLAMA_MODEL`

Optional environment variables:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `YOUTUBE_API_KEY`
- `GOOGLE_MAPS_API_KEY`
- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`
- `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID`

### 4. Install dependencies and initialize the database

From `AIYO_new/aiyo`:

```bash
npm install
npm run prisma:generate
npx prisma migrate deploy
npm run db:seed
```

If `prisma migrate deploy` fails on a fresh local machine, apply migrations manually in order:

```bash
npx prisma db execute --file prisma/migrations/20260416_000001_phase3_init/migration.sql --schema prisma/schema.prisma
npx prisma db execute --file prisma/migrations/20260416_000002_add_password_hash/migration.sql --schema prisma/schema.prisma
npx prisma db execute --file prisma/migrations/20260417_000003_add_trip_days/migration.sql --schema prisma/schema.prisma
```

### 5. Start Ollama

```bash
ollama serve
ollama pull <your-model>
```

Set `OLLAMA_MODEL` to the same model you pulled. The current default in `aiyo/.env.example` is `gemma4:26b`.

### 6. Start the app

From `AIYO_new/aiyo`:

```bash
npm run dev
```

Open `http://localhost:3000`.

## Daily development notes

- Treat `AIYO_new/docker-compose.yml` as the only supported shared Docker setup for this repo.
- Do not depend on `../AIYO/docker-compose.yml` for onboarding or day-to-day work.
- PostgreSQL is required for normal development.
- `pgadmin` and `redis` are available in the compose file, but the app setup flow only requires PostgreSQL unless your task specifically needs the others.

## Main app capabilities

- AI chat and trip planning routes
- PostgreSQL persistence through Prisma
- NextAuth with Google OAuth and credentials login
- Collaboration room comments, presence, and realtime stream endpoints
- Video recommendation and summarization flows
- Google Maps and YouTube integration paths with fallback flags

## Key documents

- `aiyo/README.md`: app-level setup and route overview
- `docs/docker_dev_migration.md`: Docker migration notes for existing local machines
- `docs/architecture.md`: architecture summary
- `docs/implementation_report.md`: implementation report
- `docs/aiyo_migration_analysis.md`: migration analysis from the legacy repo
- `aiyo/docs/phase3_production_upgrade_report.md`: latest app upgrade notes

## Notes for existing contributors

If your local machine is still using containers created from the legacy `AIYO` repository, do not assume that setup is shareable.
Before asking teammates to follow your environment, migrate your local workflow to `AIYO_new/docker-compose.yml`.
