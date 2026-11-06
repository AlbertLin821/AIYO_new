ALTER TABLE "trip_items" ADD COLUMN "placeProvider" TEXT, ADD COLUMN "placeCheckedAt" TIMESTAMP(3);
ALTER TABLE "map_pins" ADD COLUMN "placeProvider" TEXT, ADD COLUMN "placeCheckedAt" TIMESTAMP(3);
