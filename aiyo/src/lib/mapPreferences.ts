import {
  DEFAULT_MAP_LABEL_VISIBILITY,
  normalizeMapLabelVisibility,
  type MapLabelVisibility,
} from "@/lib/mapLabelStyles";
import type { GoogleMapTypeId } from "@/services/googleMapsLoader";

export type MapOverlayLayerPreference = "traffic" | "transit" | "bicycling";

export type MapPreferences = {
  mapType: GoogleMapTypeId;
  enabledLayers: Record<MapOverlayLayerPreference, boolean>;
  labelVisibility: MapLabelVisibility;
  showItineraryRoutes: boolean;
};

const MAP_PREFS_KEY = "aiyo.map.preferences";

const DEFAULT_MAP_PREFERENCES: MapPreferences = {
  mapType: "roadmap",
  enabledLayers: {
    traffic: false,
    transit: false,
    bicycling: false,
  },
  labelVisibility: DEFAULT_MAP_LABEL_VISIBILITY,
  showItineraryRoutes: true,
};

const VALID_MAP_TYPES = new Set<GoogleMapTypeId>(["roadmap", "satellite", "hybrid", "terrain"]);

export function loadMapPreferences(): MapPreferences {
  if (typeof window === "undefined") {
    return DEFAULT_MAP_PREFERENCES;
  }
  try {
    const raw = window.localStorage.getItem(MAP_PREFS_KEY);
    if (!raw) {
      return DEFAULT_MAP_PREFERENCES;
    }
    const parsed = JSON.parse(raw) as Partial<MapPreferences>;
    const mapType =
      parsed.mapType && VALID_MAP_TYPES.has(parsed.mapType) ? parsed.mapType : DEFAULT_MAP_PREFERENCES.mapType;
    const enabledLayers = {
      traffic: parsed.enabledLayers?.traffic === true,
      transit: parsed.enabledLayers?.transit === true,
      bicycling: parsed.enabledLayers?.bicycling === true,
    };
    const labelVisibility = normalizeMapLabelVisibility(parsed.labelVisibility);
    const showItineraryRoutes =
      parsed.showItineraryRoutes !== undefined ? parsed.showItineraryRoutes === true : true;
    return { mapType, enabledLayers, labelVisibility, showItineraryRoutes };
  } catch {
    return DEFAULT_MAP_PREFERENCES;
  }
}

export function saveMapPreferences(preferences: MapPreferences): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(MAP_PREFS_KEY, JSON.stringify(preferences));
  } catch {
    /* ignore quota / private mode */
  }
}
