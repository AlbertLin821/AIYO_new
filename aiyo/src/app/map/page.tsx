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
    <div className="relative h-screen w-full overflow-hidden">
      <div className="absolute inset-0">
        <MapView />
      </div>

      <ItineraryPanel />

      {!panelOpen && (
        <button
          onClick={() => setPanelOpen(true)}
          className="absolute top-4 right-4 z-20 px-3 py-2 bg-surface rounded-xl shadow-soft text-sm font-medium text-foreground hover:bg-surface-hover transition-colors cursor-pointer flex items-center gap-2"
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
