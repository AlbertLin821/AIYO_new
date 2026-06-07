# Docker Migration Inventory

This inventory maps the repository assets touched by the Docker / Open WebUI migration.

| Path | Status | Action |
|------|------|------|
| `docker-compose.yml` | active | keep and migrate to the six-service stack |
| `README.md` | active | update for the new startup flow |
| `docs/README.md` | active | update links to migration artifacts |
| `docs/docker_dev_migration.md` | active | rewrite for `.env.dev` / `.env.prod-live` |
| `docs/deep-research-report.md` | reference | keep |
| `docs/architecture.md` | active | update runtime topology and gateway flow |
| `aiyo/.env.example` | active compatibility template | keep as dev-compatible starter |
| `aiyo/.env.dev.example` | active | keep |
| `aiyo/.env.prod-live.example` | active | keep |
| `aiyo/.env.dev` | active local env | keep |
| `aiyo/.env.prod-live` | active local env | keep |
| `dev-up.ps1` | active | update |
| `prod-live-up.ps1` | active | update |
| `dev-deploy.ps1` | active wrapper | keep |
| `scripts/dev-deploy.ps1` | active | update |
| `scripts/import-compose-dotenv.ps1` | active | update |
| `scripts/backup-docker-migration.sh` | new | keep |
| `scripts/archive-legacy-docker-assets.sh` | new | keep |
| `scripts/verify-docker-stack.sh` | new | keep |
| `docker/mem0` | legacy | archive |
| `scripts/clone-mem0.sh` | legacy | archive |
| `scripts/clone-mem0.ps1` | legacy | archive |
| `searxng/` | legacy | archive |
| `vendor/mem0` | legacy vendor snapshot | archive |

## Notes

- The app still keeps optional in-code memory handling, but `MEM0_ENABLED` now defaults to `false` so the active stack no longer depends on Mem0 services.
- Legacy search / memory assets are archived instead of hard-deleted to preserve rollback options and Git history.
