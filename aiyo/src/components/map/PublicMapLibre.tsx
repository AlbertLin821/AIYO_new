"use client";
import { useEffect } from "react";
import MapLibreMapView from "@/components/map/MapLibreMapView";
import { useMapStore } from "@/stores/useMapStore";
import type { MapPin } from "@/types";

export default function PublicMapLibre({ pins, selectedPinId, className }: { pins: MapPin[]; selectedPinId?: string | null; className?: string }) {
  useEffect(() => { const state = useMapStore.getState(); state.setPins(pins, "bootstrap"); state.setSelectedPinId(selectedPinId || null); return () => useMapStore.getState().clearPins(); }, [pins, selectedPinId]);
  return <div className={className}><MapLibreMapView readOnly embedded /></div>;
}
