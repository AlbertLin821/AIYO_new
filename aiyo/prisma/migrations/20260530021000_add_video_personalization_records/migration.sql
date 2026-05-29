CREATE TABLE "video_interactions" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tripId" TEXT,
  "videoId" TEXT NOT NULL,
  "source" TEXT,
  "videoUrl" TEXT,
  "title" TEXT,
  "interactionType" TEXT NOT NULL,
  "analysisId" TEXT,
  "summaryId" TEXT,
  "watchDurationSeconds" INTEGER,
  "progress" DOUBLE PRECISION,
  "extractedPlaces" JSONB,
  "extractedTimestamps" JSONB,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "video_interactions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "applied_video_summaries" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tripId" TEXT,
  "videoId" TEXT NOT NULL,
  "summaryId" TEXT,
  "videoUrl" TEXT,
  "title" TEXT,
  "appliedPlaces" JSONB,
  "appliedSegments" JSONB,
  "createdTripItems" JSONB,
  "summarySnapshot" JSONB,
  "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "applied_video_summaries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "video_interactions_userId_createdAt_idx" ON "video_interactions"("userId", "createdAt");
CREATE INDEX "video_interactions_tripId_createdAt_idx" ON "video_interactions"("tripId", "createdAt");
CREATE INDEX "video_interactions_videoId_idx" ON "video_interactions"("videoId");

CREATE INDEX "applied_video_summaries_userId_appliedAt_idx" ON "applied_video_summaries"("userId", "appliedAt");
CREATE INDEX "applied_video_summaries_tripId_appliedAt_idx" ON "applied_video_summaries"("tripId", "appliedAt");
CREATE INDEX "applied_video_summaries_videoId_idx" ON "applied_video_summaries"("videoId");

ALTER TABLE "video_interactions"
  ADD CONSTRAINT "video_interactions_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "video_interactions"
  ADD CONSTRAINT "video_interactions_tripId_fkey"
  FOREIGN KEY ("tripId") REFERENCES "trips"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "applied_video_summaries"
  ADD CONSTRAINT "applied_video_summaries_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "applied_video_summaries"
  ADD CONSTRAINT "applied_video_summaries_tripId_fkey"
  FOREIGN KEY ("tripId") REFERENCES "trips"("id") ON DELETE SET NULL ON UPDATE CASCADE;
