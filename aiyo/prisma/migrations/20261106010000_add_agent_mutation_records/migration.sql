ALTER TABLE "trip_mutations"
ADD COLUMN "afterSnapshot" JSONB,
ADD COLUMN "operationsJson" JSONB,
ADD COLUMN "inverseJson" JSONB,
ADD COLUMN "idempotencyKey" TEXT;

CREATE UNIQUE INDEX "trip_mutations_tripId_idempotencyKey_key" ON "trip_mutations"("tripId", "idempotencyKey");
