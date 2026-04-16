# Phase 3 Production Upgrade Report

## Scope

Phase 3 upgrades `AIYO_new/aiyo` from a demo-oriented local app into a product-core baseline with:

- PostgreSQL + Prisma persistence
- authenticated user identity
- database-backed trip/chat/profile state
- collaboration presence and comments over a realtime snapshot stream
- remote sync wiring from the existing Zustand stores

## Modified files

### New

- `prisma/schema.prisma`
- `prisma/seed.ts`
- `prisma/migration_lock.toml`
- `prisma/migrations/20260416_000001_phase3_init/migration.sql`
- `src/lib/prisma.ts`
- `src/lib/auth.ts`
- `src/server/auth.ts`
- `src/server/data/appStateService.ts`
- `src/app/api/auth/[...nextauth]/route.ts`
- `src/app/api/bootstrap/route.ts`
- `src/app/api/profile/route.ts`
- `src/app/api/trips/current/route.ts`
- `src/app/api/collab/comments/route.ts`
- `src/app/api/collab/room/route.ts`
- `src/app/api/realtime/presence/route.ts`
- `src/app/api/realtime/stream/route.ts`
- `src/components/providers/AuthSessionProvider.tsx`
- `src/components/providers/AppDataBridge.tsx`
- `src/middleware.ts`
- `docs/phase3_production_upgrade_report.md`

### Updated for Phase 3 integration

- `.env.example`
- `README.md`
- `package.json`
- `package-lock.json`
- `src/app/layout.tsx`
- `src/app/login/page.tsx`
- `src/app/profile/page.tsx`
- `src/app/collaborate/page.tsx`
- `src/app/api/ai/chat/route.ts`
- `src/app/api/ai/plan/route.ts`
- `src/components/layout/Sidebar.tsx`
- `src/services/persistence.ts`
- `src/services/apiClient.ts`
- `src/services/syncService.ts`
- `src/stores/useTripStore.ts`
- `src/stores/useCollabStore.ts`
- `src/types/index.ts`

## Prisma schema

The Prisma schema now defines the required product-core tables and relations:

- `users`
- `profiles`
- `trips`
- `trip_items`
- `map_pins`
- `chat_messages`
- `collaboration_rooms`
- `comments`
- `collaboration_presence`
- NextAuth support tables: `accounts`, `sessions`, `verification_tokens`

Key implementation notes:

- `Trip` owns itinerary items, map pins, and a collaboration room.
- `ChatMessage` is linked to both `User` and optional `Trip` for persisted planning context.
- `CollaborationPresence` stores room presence, last heartbeat time, and active selection metadata.
- Prisma migration SQL was generated into `prisma/migrations/20260416_000001_phase3_init/migration.sql`.
- Seed data creates a seed user, profile, trip, chat history, pins, room, presence, and starter comment.

## Database flow

### Runtime model

- Zustand keeps short-lived UI state and cached remote state.
- Prisma-backed APIs are now the source of truth for profile, trip, chat, and collaboration data.
- `src/server/data/appStateService.ts` centralizes DB reads/writes and serialization back into the existing frontend contracts.

### Verified local database setup

During this upgrade the app was validated against a live Postgres container:

- Postgres server: legacy Docker stack in `AIYO/docker-compose.yml`
- Dedicated database for this app: `aiyo_new_db`
- Migration applied successfully to `aiyo_new_db`
- Seed script executed successfully against `aiyo_new_db`

Recommended local `DATABASE_URL`:

```env
DATABASE_URL=postgresql://aiyo:aiyo_password@localhost:5432/aiyo_new_db?schema=public
```

## Auth flow

### Provider setup

Auth is implemented with NextAuth.

Supported providers:

- Google OAuth when `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are configured
- email/password credentials login (hashed passwords in the database)

### Session behavior

- Prisma adapter persists users, sessions, and linked auth records.
- first sign-in auto-creates a default `Profile` row if one does not exist
- session data exposes `session.user.id` to server and client flows

### Route protection

Protected routes:

- `/profile`
- `/itinerary`
- `/collaborate`

Unauthorized users are redirected to `/login`.

### Data hydration after login

After sign-in:

1. `AppDataBridge` calls `/api/bootstrap`
2. bootstrap response loads:
   - user profile
   - current trip
   - chat history
   - collaboration room state
3. realtime stream starts for collaboration snapshots
4. trip and map changes begin syncing back to the server

## Realtime flow

Realtime is implemented with a lightweight server-sent event snapshot stream plus presence heartbeats.

### What syncs

- itinerary changes
- map pin changes
- collaboration comments
- online presence

### Current mechanism

- `POST /api/realtime/presence` stores user heartbeat and active section
- `GET /api/realtime/stream` opens an SSE channel
- the stream emits periodic bootstrap snapshots
- clients re-apply the latest collaboration/trip/chat/profile state

### Result

This achieves the required cross-window behavior with minimal UI disruption:

- user A edits itinerary or pins
- remote persistence updates DB
- user B receives the updated snapshot and sees the changes
- comments and presence also propagate into the second client

## Store and sync design

`src/services/syncService.ts` now handles:

- bootstrap fetch
- optimistic remote trip sync scheduling
- profile save calls
- comment write calls
- realtime stream lifecycle
- presence heartbeat dispatch
- toast-safe retry handling for network failures

The stores are now split by responsibility:

- local UI state stays in Zustand
- remote product data is hydrated from DB and synced through the BFF layer

## Manual QA checklist

### 1. Database and app boot

1. Start Postgres with Docker.
2. Set `.env.local` from `.env.example`.
3. Run `npm run prisma:generate`.
4. Apply `prisma/migrations/20260416_000001_phase3_init/migration.sql` to your database.
5. Run `npm run db:seed`.
6. Start Ollama and `npm run dev`.
7. Open `http://localhost:3000`.

Expected:

- app loads normally
- protected routes redirect to `/login` when signed out

### 2. Auth

1. Open `/login`.
2. Sign in with Google if configured, otherwise register and use email/password login.
3. Navigate to `/profile`, `/itinerary`, and `/collaborate`.
4. Use the sidebar sign-out action.

Expected:

- sign-in creates or loads a persisted user
- protected pages load after auth
- sign-out returns to public mode and protected pages redirect again

### 3. DB persistence

1. Sign in.
2. Edit the profile and save.
3. Generate a plan or edit itinerary items.
4. Refresh the page.
5. Sign out, sign back in, and reopen `/profile` and `/itinerary`.

Expected:

- profile changes persist
- itinerary changes persist
- pins and chat history reload from the database

### 4. Realtime collaboration

1. Open two browser windows and sign into the same account.
2. In window A, edit itinerary items or sync pins.
3. In window B, wait for the realtime snapshot update.
4. In window A, add a collaboration comment.
5. In window B, confirm the comment appears.
6. Keep both windows open and watch the presence section.

Expected:

- window B receives itinerary and map updates
- comments appear in both windows
- presence shows connected collaborators
- connection badge changes when the stream reconnects

### 5. Failure handling

1. Stop the Postgres container and trigger a profile or trip save.
2. Restart Postgres and retry.
3. Break Ollama temporarily and try AI chat or planning.
4. Disconnect and reconnect the browser network.

Expected:

- API failures surface as toasts instead of crashing the page
- retry after recovery succeeds
- realtime status moves to reconnecting when the stream fails

## Remaining blockers

### 1. Realtime transport is snapshot-based

The current collaboration transport uses SSE snapshots rather than per-event websockets. It satisfies the functional requirement for near-realtime multi-client updates, but it is not yet the most efficient production transport for high-frequency collaboration.

### 2. Collaboration membership is still lightweight

Invite-code lookup is now database-backed, but there is still no dedicated collaborator membership table with invitation acceptance, per-user role persistence, and room-level access controls.

### 3. Role management is still UI-light

The collaboration page shows owners and live collaborators, but editor/viewer role mutation is not yet persisted.

### 4. Middleware convention warning from Next.js 16

Build passes, but Next.js 16 warns that `middleware.ts` is deprecated in favor of the newer `proxy` convention. This is not a runtime blocker, but it should be migrated in a later cleanup pass.

## Validation summary

Validated in this upgrade session:

- `npm run prisma:generate`
- generated initial migration SQL
- applied migration to a real local Postgres database
- ran seed successfully
- `npm run lint`
- `npx tsc --noEmit`
- `npm run build`
