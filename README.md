# AIYO_new

`AIYO_new` is the active repository for the AIYO travel-planning system. The application lives in `aiyo/`; the repository root now provides a six-service Docker stack for local development and demo verification.

## Active stack

The active Compose file keeps only these services:

- `aiyo-new-app-dev`
- `aiyo-new-app-prod-live`
- `aiyo-new-postgres-dev`
- `aiyo-new-postgres-prod`
- `aiyo-new-redis`
- `open-webui`

Legacy `mem0`, `searxng`, and `pgadmin` are no longer part of the active stack. Ollama stays on the host machine and is reached through Open WebUI.

## Ports

| Service | URL / Port |
|------|------|
| Dev app | `http://127.0.0.1:3000` |
| Prod-live app | `http://127.0.0.1:3001` |
| Open WebUI | `http://127.0.0.1:8080` |
| Postgres dev | `127.0.0.1:5432` |
| Postgres prod-live | `127.0.0.1:5433` |
| Redis | `127.0.0.1:6379` |

## Environment files

Use the new split env files under `aiyo/`:

- `aiyo/.env.dev`
- `aiyo/.env.prod-live`
- `aiyo/.env.dev.example`
- `aiyo/.env.prod-live.example`

`aiyo/.env.example` is kept as a compatibility starter and mirrors the dev template.

Important keys:

- `DATABASE_URL`
- `REDIS_URL`
- `OPENWEBUI_BASE_URL`
- `OPENWEBUI_API_KEY`
- `OPENWEBUI_MODEL`
- `OPENWEBUI_SECRET_KEY`
- `OPENWEBUI_ADMIN_EMAIL`
- `OPENWEBUI_ADMIN_PASSWORD`
- `OLLAMA_*` model settings

## Prerequisites

- Docker Desktop
- Node.js 20+
- Ollama running on the host: `http://127.0.0.1:11434`

Recommended model pulls:

```bash
ollama pull qwen3.5:9b
ollama pull granite4.1:3b
ollama pull granite4.1:8b
ollama pull mistral-small:24b
```

## Start dev

From the repository root:

```powershell
.\dev-up.ps1
```

Or directly:

```bash
docker compose --env-file ./aiyo/.env.dev up -d --build --force-recreate \
  aiyo-new-postgres-dev aiyo-new-redis open-webui aiyo-new-app-dev
```

## Start prod-live

```powershell
.\prod-live-up.ps1
```

Or directly:

```bash
docker compose --env-file ./aiyo/.env.prod-live up -d --build --force-recreate \
  aiyo-new-postgres-prod aiyo-new-redis open-webui aiyo-new-app-prod-live
```

## Open WebUI setup

On first startup, Open WebUI uses `WEBUI_ADMIN_EMAIL` and `WEBUI_ADMIN_PASSWORD` to create the admin account automatically when the data volume is empty.

After `http://127.0.0.1:8080` is reachable:

1. Sign in with the configured admin account.
2. Confirm the Ollama connection.
3. Generate an API key in `Settings -> Account`.
4. Paste that key into `OPENWEBUI_API_KEY` inside `aiyo/.env.dev` and `aiyo/.env.prod-live`.
5. Recreate the app containers.

The backend is wired so that:

- primary chat completions use Open WebUI
- existing Ollama-specific flows go through the Open WebUI Ollama proxy
- the app no longer talks to host Ollama directly when `OPENWEBUI_BASE_URL` is set

## Verification

Manual checks:

```bash
curl http://127.0.0.1:11434/api/tags
curl http://127.0.0.1:8080/health
curl http://127.0.0.1:3000/api/health
curl http://127.0.0.1:3001/api/health
```

Repo scripts:

- `scripts/backup-docker-migration.sh`
- `scripts/archive-legacy-docker-assets.sh`
- `scripts/verify-docker-stack.sh`

## App checks

Run from `aiyo/`:

```bash
npm test
npm run build
npm run test:e2e:phase7
npm run test:e2e:phase8
```

When live AI and the Open WebUI API key are ready:

```powershell
$env:E2E_LIVE_AI="1"
npm run test:e2e:live-ai:itinerary
```

## Documents

- `docs/deep-research-report.md`
- `docs/docker-migration-inventory.md`
- `docs/docker-legacy-assets.md`
- `docs/docker-rollback.md`
- `docs/docker_dev_migration.md`
- `docs/architecture.md`
