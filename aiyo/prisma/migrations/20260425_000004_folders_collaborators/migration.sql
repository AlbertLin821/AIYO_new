-- CreateTable
CREATE TABLE "itinerary_folders" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "itinerary_folders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_collaborators" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trip_collaborators_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "trips" ADD COLUMN "folderId" TEXT;

-- CreateIndex
CREATE INDEX "itinerary_folders_userId_idx" ON "itinerary_folders"("userId");

-- CreateIndex
CREATE INDEX "trip_collaborators_tripId_idx" ON "trip_collaborators"("tripId");

-- CreateIndex
CREATE INDEX "trip_collaborators_userId_idx" ON "trip_collaborators"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "trip_collaborators_tripId_userId_key" ON "trip_collaborators"("tripId", "userId");

-- CreateIndex
CREATE INDEX "trips_folderId_idx" ON "trips"("folderId");

-- AddForeignKey
ALTER TABLE "itinerary_folders" ADD CONSTRAINT "itinerary_folders_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "itinerary_folders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_collaborators" ADD CONSTRAINT "trip_collaborators_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_collaborators" ADD CONSTRAINT "trip_collaborators_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
