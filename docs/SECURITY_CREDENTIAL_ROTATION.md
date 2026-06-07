# Credential rotation (2026-06-07)

A Postgres dump was briefly committed under `backup/20260607-051253-shared-postgres/` (reverted in a follow-up commit). It included dev user rows with bcrypt password hashes.

## Required actions for any environment restored from that dump

1. Reset passwords for every user row that appeared in the dump (notably `user1@gmail.com`).
2. Rotate `NEXTAUTH_SECRET` if that environment shared the dev secret.
3. Treat Open WebUI / Postgres credentials as potentially exposed if the same values were used outside local dev.

## Local dev reset

```powershell
cd aiyo
npm run db:clear-users
npm run db:seed
```

Then recreate test accounts with new passwords. Do not reuse passwords that existed in the leaked dump.
