ALTER TABLE "trips" ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "trip_mutations" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "baseRevision" INTEGER NOT NULL,
    "resultRevision" INTEGER NOT NULL,
    "beforeSnapshot" JSONB NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "undoneAt" TIMESTAMP(3),
    CONSTRAINT "trip_mutations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "trip_mutations_tripId_resultRevision_key" ON "trip_mutations"("tripId", "resultRevision");
CREATE INDEX "trip_mutations_tripId_createdAt_idx" ON "trip_mutations"("tripId", "createdAt");
ALTER TABLE "trip_mutations" ADD CONSTRAINT "trip_mutations_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;
