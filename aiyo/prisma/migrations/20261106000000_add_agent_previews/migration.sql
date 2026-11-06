CREATE TABLE "agent_previews" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "baseRevision" INTEGER NOT NULL,
    "proposalJson" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "appliedMutationId" TEXT,
    CONSTRAINT "agent_previews_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "agent_previews_tripId_actorId_status_idx" ON "agent_previews"("tripId", "actorId", "status");
CREATE INDEX "agent_previews_expiresAt_idx" ON "agent_previews"("expiresAt");
ALTER TABLE "agent_previews" ADD CONSTRAINT "agent_previews_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;
