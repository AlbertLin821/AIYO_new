# Docker Rollback

Use this guide to return from the six-service stack to the pre-migration state without deleting data prematurely.

## Backup artifacts to keep

- `backup/<timestamp>/git-status.before.txt`
- `backup/<timestamp>/working-tree.before.patch`
- copied env files and compose files
- any `*.sql` dump created by `scripts/backup-docker-migration.sh`

## Stop the new stack but keep volumes

Dev stack:

```bash
docker compose --env-file ./aiyo/.env.dev down
```

Prod-live stack:

```bash
docker compose --env-file ./aiyo/.env.prod-live down
```

Do not add `-v` unless you intentionally want to destroy the new volumes.

## Restore files

1. Restore the backup copy of `docker-compose.yml`.
2. Restore the previous env files from `backup/<timestamp>/`.
3. If you archived legacy assets, move them back from `archive/legacy/<timestamp>/`.

## Recreate the previous containers

Once the previous compose and env files are restored:

```bash
docker compose up -d --build
```

If the previous setup used profile-based services, include the relevant profiles from that older compose file.

## Restore PostgreSQL from pg_dumpall

If you need to rehydrate the old single Postgres instance:

```bash
cat backup/<timestamp>/aiyo-new-postgres.sql | docker exec -i aiyo-new-postgres psql -U aiyo
```

If the dump was taken from a different container name, use that matching file and user.

## Remove new split-stack volumes only on full rollback

```bash
docker volume rm \
  aiyo_new_postgres_dev_data \
  aiyo_new_postgres_prod_data \
  aiyo_new_redis_data \
  open_webui_data \
  aiyo_new_node_modules_dev \
  aiyo_new_node_modules_prod_live \
  aiyo_new_next_dev \
  aiyo_new_next_prod_live
```

Only run the command above after you have confirmed the old stack is restored successfully.
