# Docker Dev Migration

`AIYO_new` is now the canonical local Docker setup.

## Target state

Use the single root `docker-compose.yml` with these services only:

- `aiyo-new-app-dev`
- `aiyo-new-app-prod-live`
- `aiyo-new-postgres-dev`
- `aiyo-new-postgres-prod`
- `aiyo-new-redis`
- `open-webui`

Host Ollama remains outside Docker at `http://127.0.0.1:11434`.

## New env files

Switch local setup to:

- `aiyo/.env.dev`
- `aiyo/.env.prod-live`

Do not continue onboarding around the older `aiyo/.env` plus `mem0` profile flow.

## Migration steps for existing machines

1. Backup the current stack with `scripts/backup-docker-migration.sh`.
2. Stop older containers that still use the retired stack.
3. Start the new dev stack:

   ```bash
   docker compose --env-file ./aiyo/.env.dev up -d --build --force-recreate \
     aiyo-new-postgres-dev aiyo-new-redis open-webui aiyo-new-app-dev
   ```

4. Open `http://127.0.0.1:8080`, sign in to Open WebUI, and generate an API key.
5. Fill `OPENWEBUI_API_KEY` in `aiyo/.env.dev` and recreate `open-webui` + app containers.
6. Verify:
   - `curl http://127.0.0.1:11434/api/tags`
   - `curl http://127.0.0.1:8080/health`
   - `curl http://127.0.0.1:3000/api/health`
7. Run application checks from `aiyo/`:
   - `npm test`
   - `npm run build`
   - `npm run test:e2e:phase7`
   - `npm run test:e2e:phase8`

## Notes

- `mem0`, `searxng`, and `pgadmin` are no longer active dependencies of the stack.
- Planner logic still keeps safe fallbacks when AI or external services fail.
- Rollback instructions live in [docker-rollback.md](./docker-rollback.md).
