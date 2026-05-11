-- CreateTable
CREATE TABLE "video_summary_caches" (
    "id" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "video_summary_caches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "video_summary_caches_videoId_key" ON "video_summary_caches"("videoId");
