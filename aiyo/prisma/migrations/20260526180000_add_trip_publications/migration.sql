-- CreateTable
CREATE TABLE "trip_publications" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "publisherId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "coverImageUrl" TEXT,
    "days" INTEGER NOT NULL,
    "destination" TEXT,
    "searchText" TEXT NOT NULL DEFAULT '',
    "snapshotJson" JSONB NOT NULL,
    "publisherImage" TEXT,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "trip_publications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "trip_publications_tripId_key" ON "trip_publications"("tripId");

-- CreateIndex
CREATE INDEX "trip_publications_publishedAt_idx" ON "trip_publications"("publishedAt" DESC);

-- CreateIndex
CREATE INDEX "trip_publications_publisherId_idx" ON "trip_publications"("publisherId");

-- AddForeignKey
ALTER TABLE "trip_publications" ADD CONSTRAINT "trip_publications_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_publications" ADD CONSTRAINT "trip_publications_publisherId_fkey" FOREIGN KEY ("publisherId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
