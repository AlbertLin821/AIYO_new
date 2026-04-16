'use client';

import MapView from '@/components/map/MapView';
import ItineraryPanel from '@/components/map/ItineraryPanel';
import VoicePlanningButton from '@/components/map/VoicePlanningButton';
import FloatingAIChat from '@/components/map/FloatingAIChat';
import { useMapStore } from '@/stores/useMapStore';
import { CalendarDays } from 'lucide-react';

export default function MapPage() {
  const { panelOpen, setPanelOpen } = useMapStore();

  return (
    <div className="relative h-screen w-full overflow-hidden">
      {/* Map Container */}
      <div className="absolute inset-0">
        <MapView />
      </div>

      {/* Itinerary Panel */}
      <ItineraryPanel />

      {/* Toggle Panel Button (when closed) */}
      {!panelOpen && (
        <button
          onClick={() => setPanelOpen(true)}
          className="absolute top-4 right-4 z-20 px-3 py-2 bg-surface rounded-xl shadow-soft text-sm font-medium text-foreground hover:bg-surface-hover transition-colors cursor-pointer flex items-center gap-2"
        >
          <CalendarDays className="size-4 text-primary" />
          行程面板
        </button>
      )}

      {/* Voice Planning Button */}
      <VoicePlanningButton />

      {/* Floating AI Chat */}
      <FloatingAIChat />
    </div>
  );
}
