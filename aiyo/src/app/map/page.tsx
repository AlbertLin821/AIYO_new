"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";
import { CalendarDays } from "lucide-react";
import { useSession } from "next-auth/react";
import { zhTW as t } from "@/locales/zh-TW";
import { syncService } from "@/services/syncService";
import { useMapStore } from "@/stores/useMapStore";

const MapView = dynamic(() => import("@/components/map/MapView"), {
  ssr: false,
  loading: () => <div className="min-h-0 flex-1 rounded-2xl border-2 border-border bg-surface" />,
});
const ItineraryPanel = dynamic(() => import("@/components/map/ItineraryPanel"), { ssr: false });

export default function MapPage() {
  const { status } = useSession();
  const { panelOpen, setPanelOpen } = useMapStore();

  useEffect(() => {
    if (status !== "authenticated") {
      return;
    }

    let cancelled = false;

    void syncService
      .loadBootstrap()
      .then((snapshot) => {
        if (cancelled) {
          return;
        }
        syncService.applyBootstrap(snapshot, {
          source: "map-route-refresh",
          forceTrip: true,
        });
      })
      .catch(() => {
        // 避免地圖頁因刷新快照失敗而中斷既有互動。
      });

    return () => {
      cancelled = true;
    };
  }, [status]);

  return (
    <div className="relative flex h-[100dvh] max-lg:h-[calc(100dvh-3.5rem-env(safe-area-inset-bottom,0px))] min-h-0 w-full flex-col overflow-hidden bg-background">
      <div className="relative flex min-h-0 flex-1 flex-col p-3 sm:p-4">
        <MapView allowPoiAdd />
      </div>

      <ItineraryPanel enablePoiAdd={false} />

      {!panelOpen && (
        <button
          onClick={() => setPanelOpen(true)}
          className="absolute top-4 right-4 z-20 flex cursor-pointer items-center gap-2 rounded-xl border-2 border-border bg-surface px-3 py-2 text-sm font-medium text-foreground shadow-soft-lg transition-colors hover:border-primary/40 hover:bg-surface-elevated"
        >
          <CalendarDays className="size-4 text-primary" />
          {t.mapPage.openItineraryPanel}
        </button>
      )}

    </div>
  );
}
