"use client";

import { AnimatePresence, m } from "@/lib/motion";
import MapPoiAddCard from "@/components/map/MapPoiAddCard";
import { useMapStore } from "@/stores/useMapStore";

type MapPoiAddSheetProps = {
  defaultDayNumber: number;
  tripDestination: string;
  onAdded?: (dayNumber: number) => void;
};

export default function MapPoiAddSheet({
  defaultDayNumber,
  tripDestination,
  onAdded,
}: MapPoiAddSheetProps) {
  const pendingPoi = useMapStore((state) => state.pendingPoi);

  return (
    <AnimatePresence>
      {pendingPoi ? (
        <m.div
          key="map-poi-add-sheet"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          className="pointer-events-none fixed bottom-24 left-1/2 z-[25] flex w-[min(92vw,28rem)] -translate-x-1/2 justify-center px-3"
        >
          <div className="pointer-events-auto w-full max-w-md overflow-hidden rounded-2xl border-2 border-primary/25 bg-surface shadow-soft-lg">
            <MapPoiAddCard
              defaultDayNumber={defaultDayNumber}
              tripDestination={tripDestination}
              onAdded={onAdded}
              className="border-b-0 bg-surface"
            />
          </div>
        </m.div>
      ) : null}
    </AnimatePresence>
  );
}
