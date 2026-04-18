-- CreateTable
CREATE TABLE "trip_days" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "dayNumber" INTEGER NOT NULL,
    "theme" TEXT,
    "summary" TEXT,
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "trip_days_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "trip_days_tripId_dayNumber_key" ON "trip_days"("tripId", "dayNumber");

-- CreateIndex
CREATE INDEX "trip_days_tripId_sortOrder_idx" ON "trip_days"("tripId", "sortOrder");

-- AddForeignKey
ALTER TABLE "trip_days" ADD CONSTRAINT "trip_days_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill existing day rows from trip items.
INSERT INTO "trip_days" ("id", "tripId", "dayNumber", "theme", "summary", "sortOrder")
SELECT
    CONCAT('tripday_', md5(CONCAT("tripId", ':', "day"::text))) AS "id",
    "tripId",
    "day" AS "dayNumber",
    CONCAT('Day ', "day"::text) AS "theme",
    NULL AS "summary",
    "day" - 1 AS "sortOrder"
FROM "trip_items"
GROUP BY "tripId", "day";

-- Ensure trips without items still have a persisted first day.
INSERT INTO "trip_days" ("id", "tripId", "dayNumber", "theme", "summary", "sortOrder")
SELECT
    CONCAT('tripday_', md5(CONCAT(t."id", ':1'))) AS "id",
    t."id",
    1 AS "dayNumber",
    'Day 1' AS "theme",
    NULL AS "summary",
    0 AS "sortOrder"
FROM "trips" t
WHERE NOT EXISTS (
    SELECT 1
    FROM "trip_days" d
    WHERE d."tripId" = t."id"
);
