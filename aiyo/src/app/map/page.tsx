"use client";

import { CalendarDays } from "lucide-react";
import FloatingAIChat from "@/components/map/FloatingAIChat";
import ItineraryPanel from "@/components/map/ItineraryPanel";
import MapView from "@/components/map/MapView";
import VoicePlanningButton from "@/components/map/VoicePlanningButton";
import { zhTW as t } from "@/locales/zh-TW";
import { useMapStore } from "@/stores/useMapStore";

export default function MapPage() {
  const { panelOpen, setPanelOpen } = useMapStore();

  return (
    <div className="relative flex h-[100dvh] max-lg:h-[calc(100dvh-3.5rem-env(safe-area-inset-bottom,0px))] min-h-0 w-full flex-col overflow-hidden bg-background">
      <div className="relative flex min-h-0 flex-1 flex-col p-3 sm:p-4">
        <MapView />
      </div>

      <ItineraryPanel />

      {!panelOpen && (
        <button
          onClick={() => setPanelOpen(true)}
          className="absolute top-4 right-4 z-20 flex cursor-pointer items-center gap-2 rounded-xl border-2 border-border bg-surface px-3 py-2 text-sm font-medium text-foreground shadow-soft-lg transition-colors hover:border-primary/40 hover:bg-surface-elevated"
        >
          <CalendarDays className="size-4 text-primary" />
          {t.mapPage.openItineraryPanel}
        </button>
      )}

      <VoicePlanningButton />
      <FloatingAIChat />
    </div>
  );
}
