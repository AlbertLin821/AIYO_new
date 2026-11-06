"use client";

import { useEffect, useRef } from "react";
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
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (pendingPoi) sheetRef.current?.focus();
  }, [pendingPoi]);

  return (
    <AnimatePresence>
      {pendingPoi ? (
        <m.div
          ref={sheetRef}
          key="map-poi-add-sheet"
          role="region"
          aria-label="加入行程"
          tabIndex={-1}
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
