# AIYO App

`AIYO_new/aiyo` is the main application. The active runtime model is:

- AIYO app containers for `dev` and `prod-live`
- split PostgreSQL databases
- shared Redis
- Open WebUI as the authenticated AI gateway
- Ollama on the host machine

The repository root owns the Docker workflow. Start there unless you are running app-only commands.

## Environment files

The active project env files are:

- `aiyo/.env.dev`
- `aiyo/.env.prod-live`
- `aiyo/.env.dev.example`
- `aiyo/.env.prod-live.example`

`aiyo/.env.example` is only a compatibility starter template. New work should use `.env.dev` or `.env.prod-live`.

## Local stack

1. Create the env files if they do not exist yet:

```bash
cp .env.dev.example .env.dev
cp .env.prod-live.example .env.prod-live
```

2. From the repository root, start the dev stack:

```bash
cd ..
powershell -ExecutionPolicy Bypass -File .\dev-up.ps1
```

Or run Compose directly:

```bash
docker compose --env-file ./aiyo/.env.dev up -d --build --force-recreate \
  aiyo-new-postgres-dev aiyo-new-redis open-webui aiyo-new-app-dev
```

3. Open:

- App: `http://127.0.0.1:3000`
- Open WebUI: `http://127.0.0.1:8080`
- Health: `http://127.0.0.1:3000/api/health`

## Open WebUI

AIYO now uses Open WebUI as the main AI gateway:

- primary chat completions go through `POST /api/chat/completions`
- legacy Ollama-specific paths route through the Open WebUI Ollama proxy
- `GET /api/ai/ollama-status` remains the frontend compatibility route

On first startup, Open WebUI uses `OPENWEBUI_ADMIN_EMAIL` and `OPENWEBUI_ADMIN_PASSWORD` from the env file to create the admin account when the data volume is empty. After signing in:

1. Open Settings and create an API key.
2. Paste that key into `OPENWEBUI_API_KEY` in `aiyo/.env.dev` and `aiyo/.env.prod-live`.
3. Recreate `open-webui` and the matching app container.

## App commands

Run these inside `AIYO_new/aiyo`:

```bash
npm install
npm run prisma:generate
npm run build
npm test
```

Planner checks:

```bash
npm run test:e2e:phase7
npm run test:e2e:phase8
```

Live AI itinerary check, only after `OPENWEBUI_API_KEY` is configured and the stack is healthy:

```powershell
$env:E2E_LIVE_AI="1"
npm run test:e2e:live-ai:itinerary
```

## Required env values

- `DATABASE_URL`
- `REDIS_URL`
- `NEXTAUTH_URL`
- `NEXTAUTH_SECRET`
- `OPENWEBUI_BASE_URL`
- `OPENWEBUI_API_KEY`
- `OPENWEBUI_MODEL`

Optional but commonly used:

- `YOUTUBE_API_KEY`
- `GOOGLE_MAPS_API_KEY`
- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`
- `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID`
- `OLLAMA_*` model overrides

## Reference docs

- [`../README.md`](../README.md)
- [`../docs/README.md`](../docs/README.md)
- [`../docs/architecture.md`](../docs/architecture.md)
- [`docs/README.md`](./docs/README.md)
