# Docker Dev Migration

`AIYO_new` should be the canonical dev setup for this repository.
Do not rely on `../AIYO/docker-compose.yml` for shared onboarding.

## New collaborators

From the `AIYO_new` root:

```bash
docker compose up -d postgres
cd aiyo
npm run prisma:generate
npx prisma migrate deploy
npm run db:seed
```

The compose file creates `aiyo_new_db` automatically.

## Existing local machines

If your local app is still working against the legacy `AIYO` stack, migrate in this order:

1. Stop the legacy app containers if they are running.
2. Start PostgreSQL from `AIYO_new/docker-compose.yml`.
3. Keep using the same `DATABASE_URL` shown in `aiyo/.env.example`.
4. Run Prisma migrate and seed from `AIYO_new/aiyo`.
5. Verify login, bootstrap, and trip flows before deleting old containers or volumes.

## Why this matters

The new compose project uses its own named volumes, so the repo is self-contained for teammates and no longer depends on a sibling project directory.
