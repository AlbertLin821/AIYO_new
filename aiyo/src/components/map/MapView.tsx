"use client";
"use memo";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { m } from "@/lib/motion";
import { AlertCircle, MapPin, Navigation, RefreshCcw, Settings, ZoomIn, ZoomOut } from "lucide-react";
import type {
  GoogleInfoWindowInstance,
  GoogleMapLayerInstance,
  GoogleMapInstance,
  GoogleMapTypeId,
  GoogleMapsApi,
  GoogleMarkerInstance,
  GooglePolylineInstance,
} from "@/services/googleMapsLoader";
import {
  AIYO_MAPS_AUTH_FAILURE_EVENT,
  AIYO_MAPS_TARGET_BLOCKED_EVENT,
  isGoogleMapsTargetBlockedMessage,
  loadGoogleMapsApi,
} from "@/services/googleMapsLoader";
import { fetchItineraryRoutePaths } from "@/lib/fetchItineraryDirections";
import { logFrontendDebugEvent } from "@/lib/frontendDebug";
import { cn } from "@/lib/utils";
import { inferMapsRegionCode } from "@/lib/tripTransportRegion";
import { buildItineraryRouteSegments, type ItineraryRouteSegment } from "@/lib/routeSegments";
import { useMapStore } from "@/stores/useMapStore";
import { useToastStore } from "@/stores/useToastStore";
import { useTripStore } from "@/stores/useTripStore";
import type { LocationReference, MapPin as MapPinType } from "@/types";
import { zhTW as t } from "@/locales/zh-TW";
import { buildPinStopOrderByPinId } from "@/lib/mapPinItineraryLink";
import { createMapPinElement, encodeMapPinDataUrl, MAP_PIN_VIEWBOX_H, MAP_PIN_VIEWBOX_W } from "@/components/map/mapPinIcon";
import { MapPinMarker } from "@/components/map/MapPinMarker";
import MapPinInfoPanel from "@/components/map/MapPinInfoPanel";
import MapPoiAddOverlay from "@/components/map/MapPoiAddOverlay";
import { buildPinInfoContent } from "@/components/map/mapPinInfoShared";
import { resolvePlacePhotoUrl } from "@/lib/placePhotoUrl";
import { MAP_CONTROLS_OFFSET_WITH_PANEL } from "@/lib/mapLayout";
import { loadMapPreferences, saveMapPreferences } from "@/lib/mapPreferences";
import {
  buildMapLabelStyles,
  type MapLabelToggleKey,
} from "@/lib/mapLabelStyles";
import {
  collectMapViewportPoints,
  DEFAULT_MAP_TW_CENTER,
  DEFAULT_MAP_TW_ZOOM,
  focusLocationToPoint,
  getMockLatLngRanges,
  pinsGeometryKey,
  shouldUseTaiwanDefaultViewport,
  type MapViewportPoint,
} from "@/lib/mapViewport";
import { syncService } from "@/services/syncService";
import { normalizeGoogleMapsMapId, resolveGoogleMapsMapId } from "@/lib/googleMapsEnv";
import { geocodeQuery } from "@/services/geocodeItineraryItems";

const GOOGLE_MAPS_API_KEY = (
  process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || ""
).trim();
/** 與伺服端 ENABLE_MOCK_MAPS 對齊：建置時由 next.config 注入。 */
const FORCE_MOCK_MAP = process.env.NEXT_PUBLIC_ENABLE_MOCK_MAPS === "true";
/** Vector map ID from Cloud Console (Map Management). Required for AdvancedMarkerElement; omit to use legacy Marker. */
const GOOGLE_MAPS_MAP_ID = resolveGoogleMapsMapId();

const PLACE_DETAILS_CACHE_PREFIX = "aiyo:place-details:v2:";
const PLACE_DETAILS_HIT_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const PLACE_DETAILS_MISS_TTL_MS = 1000 * 60 * 60 * 24;

const MAP_TYPE_OPTIONS: Array<{ value: GoogleMapTypeId; label: string }> = [
  { value: "roadmap", label: t.map.mapTypeRoadmap },
  { value: "satellite", label: t.map.mapTypeSatellite },
  { value: "hybrid", label: t.map.mapTypeHybrid },
  { value: "terrain", label: t.map.mapTypeTerrain },
];

type MapOverlayLayer = "traffic" | "transit" | "bicycling";

const MAP_LAYER_OPTIONS: Array<{ value: MapOverlayLayer; label: string }> = [
  { value: "traffic", label: t.map.layerTraffic },
  { value: "transit", label: t.map.layerTransit },
  { value: "bicycling", label: t.map.layerBicycling },
];

const MAP_LABEL_TOGGLE_OPTIONS: Array<{ value: MapLabelToggleKey; label: string }> = [
  { value: "highway", label: t.map.labelHighway },
  { value: "road", label: t.map.labelRoad },
  { value: "poi", label: t.map.labelPoi },
  { value: "administrative", label: t.map.labelAdministrative },
];

type SdkState = "loading" | "ready" | "error";

type RuntimeMapsConfig = {
  googleMapsApiKey: string;
  googleMapsMapId: string;
  enableMockMaps: boolean;
};

type PlaceDetailsCacheEntry = {
  cachedAt: number;
  details?: Partial<MapPinType>;
  miss?: boolean;
};

function escapeHtml(value: string | number | undefined): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDistanceKm(distanceKm: number): string {
  return distanceKm >= 10 ? `${distanceKm.toFixed(0)} km` : `${distanceKm.toFixed(1)} km`;
}

function formatRouteMinutes(minutes: number): string {
  if (minutes < 60) {
    return `${minutes} 分`;
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest > 0 ? `${hours} 小時 ${rest} 分` : `${hours} 小時`;
}

function segmentRouteDisplayMinutes(
  segment: ItineraryRouteSegment,
  durationSeconds: number | undefined,
  usedDirections: boolean,
): number {
  if (usedDirections && typeof durationSeconds === "number" && durationSeconds > 0) {
    return Math.max(1, Math.round(durationSeconds / 60));
  }
  return segment.estimatedMinutes;
}

function buildMarkerPinIcon(maps: GoogleMapsApi, color: string, selected: boolean, stopLabel?: number) {
  const baseW = selected ? 40 : 34;
  const height = Math.round((MAP_PIN_VIEWBOX_H / MAP_PIN_VIEWBOX_W) * baseW);
  return {
    url: encodeMapPinDataUrl(color, selected, stopLabel),
    scaledSize: new maps.Size(baseW, height),
    anchor: new maps.Point(baseW / 2, height),
  };
}

function needsPlaceDetails(pin: MapPinType, linkedItem?: { location?: LocationReference }): boolean {
  const hasImage = Boolean(pin.thumbnail || pin.photoUrl || linkedItem?.location?.thumbnail || linkedItem?.location?.photoUrl);
  const hasOpeningHours = Boolean(pin.openingHours || linkedItem?.location?.openingHours);
  const hasPhone = Boolean(pin.phoneNumber || linkedItem?.location?.phoneNumber);
  return !hasImage || !hasOpeningHours || !hasPhone;
}

function mergePinDetails(pin: MapPinType, patch: Partial<MapPinType>): MapPinType {
  return {
    ...pin,
    address: pin.address || patch.address,
    placeId: pin.placeId || patch.placeId,
    photoUrl: pin.photoUrl || patch.photoUrl,
    thumbnail: pin.thumbnail || patch.thumbnail || patch.photoUrl,
    openingHours: pin.openingHours || patch.openingHours,
    phoneNumber: pin.phoneNumber || patch.phoneNumber,
    website: pin.website || patch.website,
    googleMapsUrl: pin.googleMapsUrl || patch.googleMapsUrl,
    rating: pin.rating ?? patch.rating,
    userRatingsTotal: pin.userRatingsTotal ?? patch.userRatingsTotal,
    verified: pin.verified ?? patch.verified,
  };
}

function mergeLocationDetails(location: LocationReference, patch: Partial<LocationReference>): LocationReference {
  return {
    ...location,
    address: location.address || patch.address,
    placeId: location.placeId || patch.placeId,
    photoUrl: location.photoUrl || patch.photoUrl,
    thumbnail: location.thumbnail || patch.thumbnail || patch.photoUrl,
    openingHours: location.openingHours || patch.openingHours,
    phoneNumber: location.phoneNumber || patch.phoneNumber,
    website: location.website || patch.website,
    googleMapsUrl: location.googleMapsUrl || patch.googleMapsUrl,
    rating: location.rating ?? patch.rating,
    userRatingsTotal: location.userRatingsTotal ?? patch.userRatingsTotal,
    verified: location.verified ?? patch.verified,
  };
}

function detailsRequestKey(pin: MapPinType, linkedItem?: { location?: LocationReference }): string {
  const placeId = pin.placeId || linkedItem?.location?.placeId;
  if (placeId) {
    return `place:${placeId}`;
  }
  return `name:${pin.name.trim().toLowerCase()}:${pin.lat.toFixed(5)}:${pin.lng.toFixed(5)}`;
}

function normalizePhotoPatch<T extends Partial<MapPinType>>(patch: T): T {
  const next = { ...patch };
  if (patch.photoUrl) {
    next.photoUrl = resolvePlacePhotoUrl(patch.photoUrl) ?? patch.photoUrl;
  }
  if (patch.thumbnail) {
    next.thumbnail = resolvePlacePhotoUrl(patch.thumbnail) ?? patch.thumbnail;
  }
  return next;
}

function readPlaceDetailsCache(key: string): PlaceDetailsCacheEntry | null {
  try {
    const raw = window.localStorage.getItem(`${PLACE_DETAILS_CACHE_PREFIX}${key}`);
    if (!raw) {
      return null;
    }
    const entry = JSON.parse(raw) as PlaceDetailsCacheEntry;
    const age = Date.now() - Number(entry.cachedAt || 0);
    const ttl = entry.miss ? PLACE_DETAILS_MISS_TTL_MS : PLACE_DETAILS_HIT_TTL_MS;
    if (!Number.isFinite(age) || age < 0 || age > ttl) {
      window.localStorage.removeItem(`${PLACE_DETAILS_CACHE_PREFIX}${key}`);
      return null;
    }
    return entry;
  } catch {
    return null;
  }
}

function writePlaceDetailsCache(key: string, entry: Omit<PlaceDetailsCacheEntry, "cachedAt">) {
  try {
    window.localStorage.setItem(
      `${PLACE_DETAILS_CACHE_PREFIX}${key}`,
      JSON.stringify({ ...entry, cachedAt: Date.now() }),
    );
  } catch {
    /* localStorage can be unavailable in private or restricted contexts. */
  }
}

function findLinkedItineraryItem(
  itinerary: ReturnType<typeof useTripStore.getState>["itinerary"],
  pin: MapPinType | null,
) {
  if (!pin) {
    return undefined;
  }
  return itinerary
    .flatMap((day) => day.items)
    .find((item) => {
      if (pin.linkedTripItemId && item.id === pin.linkedTripItemId) {
        return true;
      }
      if (item.location?.placeId && pin.placeId && item.location.placeId === pin.placeId) {
        return true;
      }
      if (
        item.location &&
        Math.abs(item.location.lat - pin.lat) < 0.00001 &&
        Math.abs(item.location.lng - pin.lng) < 0.00001
      ) {
        return true;
      }
      return item.location?.name?.trim().toLowerCase() === pin.name.trim().toLowerCase();
    });
}

function buildRouteSegmentInfoContent(segment: ItineraryRouteSegment, displayMinutes: number): string {
  return `
    <article style="min-width:240px;max-width:320px;padding:10px 8px;font-family:inherit;color:#1f2937;">
      <div style="font-size:11px;font-weight:700;color:#426991;letter-spacing:.04em;">${escapeHtml(t.map.relatedRoutes)}</div>
      <h3 style="margin:6px 0 0;font-size:15px;line-height:1.35;font-weight:700;color:#111827;">D${escapeHtml(segment.dayNumber)} ${escapeHtml(segment.fromName)} → ${escapeHtml(segment.toName)}</h3>
      <dl style="display:grid;grid-template-columns:64px 1fr;gap:6px 8px;margin:10px 0 0;font-size:12px;line-height:1.45;">
        <dt style="color:#6b7280;">時間</dt>
        <dd style="margin:0;color:#1f2937;">${escapeHtml(segment.fromTime)} → ${escapeHtml(segment.toTime)}</dd>
        <dt style="color:#6b7280;">交通</dt>
        <dd style="margin:0;color:#1f2937;">${escapeHtml(segment.transport)}</dd>
        <dt style="color:#6b7280;">距離</dt>
        <dd style="margin:0;color:#1f2937;">${escapeHtml(formatDistanceKm(segment.distanceKm))}</dd>
        <dt style="color:#6b7280;">時間</dt>
        <dd style="margin:0;color:#1f2937;">${escapeHtml(formatRouteMinutes(displayMinutes))}</dd>
      </dl>
    </article>
  `;
}

function segmentTouchesLinkedItem(
  segment: ItineraryRouteSegment,
  linkedItem: ReturnType<typeof findLinkedItineraryItem> | undefined,
) {
  if (!linkedItem) {
    return false;
  }
  return segment.fromItemId === linkedItem.id || segment.toItemId === linkedItem.id;
}

function MockMapFallback({
  pins,
  pinStopById,
  routeSegments,
  highlightedRouteIds,
  showItineraryRoutes,
  viewportPoints,
  selectedPinId,
  onPinMarkerClick,
  onPinInfoClose,
  itinerary,
  zoom,
  readOnly = false,
}: {
  pins: MapPinType[];
  pinStopById: ReadonlyMap<string, number>;
  routeSegments: ItineraryRouteSegment[];
  highlightedRouteIds: Set<string>;
  showItineraryRoutes: boolean;
  viewportPoints: MapViewportPoint[];
  selectedPinId: string | null;
  onPinMarkerClick: (pinId: string) => void;
  onPinInfoClose: () => void;
  itinerary: ReturnType<typeof useTripStore.getState>["itinerary"];
  zoom: number;
  readOnly?: boolean;
}) {
  const [hoveredPin, setHoveredPin] = useState<string | null>(null);
  const segmentDirectionsMinutes = useMapStore((s) => s.segmentDirectionsMinutes);
  const selectedPin = pins.find((pin) => pin.id === selectedPinId) || null;
  const selectedLinkedItem = findLinkedItineraryItem(itinerary, selectedPin);

  const { latRange, lngRange } = getMockLatLngRanges(viewportPoints);

  function getPos(lat: number, lng: number) {
    return {
      x: ((lng - lngRange.min) / (lngRange.max - lngRange.min)) * 74 + 13,
      y: (1 - (lat - latRange.min) / (latRange.max - latRange.min)) * 74 + 13,
    };
  }

  return (
    <div
      className="map-mock-shell map-grid absolute inset-0 flex min-h-0 w-full overflow-hidden"
      aria-label={t.map.mockLegend}
    >
      <div
        className="relative mx-auto box-border flex size-full items-center justify-center px-4 py-6"
      >
        <div
          className="relative w-full max-w-5xl transition-transform duration-300 ease-out"
          style={{
            transform: `scale(${zoom})`,
            transformOrigin: "center center",
            minHeight: "min(52vh, 520px)",
          }}
        >
          <svg className="pointer-events-none absolute inset-x-8 inset-y-6 z-[1] h-[calc(100%-3rem)] w-[calc(100%-4rem)] opacity-95">
            <rect
              x="4%"
              y="6%"
              width="92%"
              height="88%"
              rx="28"
              fill="rgba(255,255,255,0.38)"
              stroke="rgba(45,76,118,0.22)"
              strokeWidth="2"
            />
          </svg>

          <svg className="pointer-events-none absolute inset-0 z-[1] h-full w-full">
            {showItineraryRoutes
              ? routeSegments.map((segment) => {
                const isHighlighted = highlightedRouteIds.has(segment.id);
                const from = getPos(segment.from.lat, segment.from.lng);
                const to = getPos(segment.to.lat, segment.to.lng);
                const midX = (from.x + to.x) / 2;
                const midY = (from.y + to.y) / 2;
                return (
                  <g key={segment.id}>
                    <line
                      x1={`${from.x}%`}
                      y1={`${from.y}%`}
                      x2={`${to.x}%`}
                      y2={`${to.y}%`}
                      stroke={segment.color}
                      strokeWidth={isHighlighted ? "5" : "3"}
                      strokeDasharray="8 6"
                      opacity={isHighlighted ? "1" : "0.48"}
                    />
                    <text
                      x={`${midX}%`}
                      y={`${midY}%`}
                      textAnchor="middle"
                      dominantBaseline="central"
                      className="fill-foreground text-[10px] font-semibold"
                      paintOrder="stroke"
                      stroke="rgba(255,255,255,0.92)"
                      strokeWidth="5"
                    >
                      {`${segment.transport} · ${formatRouteMinutes(
                        segmentDirectionsMinutes[segment.id] ?? segment.estimatedMinutes,
                      )}`}
                    </text>
                  </g>
                );
              })
              : null}
          </svg>

          {pins.map((pin) => {
            const pos = getPos(pin.lat, pin.lng);
            const isSelected = pin.id === selectedPinId;
            const pinBody = (
              <div className={cn("group relative", readOnly ? "cursor-pointer" : "cursor-pointer transition-transform group-hover:scale-105")}>
                <MapPinMarker
                  fill={pin.color || "#5a7ea3"}
                  selected={isSelected}
                  stopOrder={pinStopById.get(pin.id)}
                  decorative
                />
                {!readOnly && hoveredPin === pin.id && !selectedPinId && (
                  <div className="absolute bottom-full left-1/2 z-10 mb-2 -translate-x-1/2 whitespace-nowrap rounded-xl border border-border bg-surface px-3 py-2 text-left shadow-soft-lg">
                    <p className="text-xs font-semibold text-foreground">{pin.name}</p>
                    <p className="mt-0.5 max-w-[220px] text-[10px] text-muted">{pin.description}</p>
                  </div>
                )}
              </div>
            );
            if (readOnly) {
              return (
                <m.button
                  key={pin.id}
                  initial={{ scale: 0, y: 10 }}
                  animate={{ scale: 1, y: 0 }}
                  type="button"
                  data-testid="map-pin-marker"
                  aria-label={pin.name}
                  className="absolute z-[2] -translate-x-1/2 -translate-y-full outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-primary"
                  style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
                  onClick={() => onPinMarkerClick(pin.id)}
                >
                  {pinBody}
                </m.button>
              );
            }
            return (
              <m.button
                key={pin.id}
                initial={{ scale: 0, y: 10 }}
                animate={{ scale: 1, y: 0 }}
                type="button"
                data-testid="map-pin-marker"
                aria-label={pin.name}
                className="absolute z-[2] -translate-x-1/2 -translate-y-full outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-primary"
                style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
                onMouseEnter={() => setHoveredPin(pin.id)}
                onMouseLeave={() => setHoveredPin(null)}
                onClick={() => onPinMarkerClick(pin.id)}
              >
                {pinBody}
              </m.button>
            );
          })}

          {!readOnly && selectedPin && (
            <div className="absolute bottom-4 left-4 z-[12] max-w-[calc(100%-2rem)]">
              <MapPinInfoPanel
                pin={selectedPin}
                linkedItem={selectedLinkedItem}
                onClose={onPinInfoClose}
              />
            </div>
          )}

          {pins.length === 0 && (
            <div className="absolute inset-0 z-[2] flex items-center justify-center px-8">
              <div className="max-w-sm rounded-2xl border border-border-strong/40 bg-surface/90 px-6 py-8 text-center shadow-soft-lg backdrop-blur-sm">
                <MapPin className="mx-auto mb-3 size-10 text-primary/80" aria-hidden />
                <p className="text-sm font-semibold text-foreground">{t.map.noPinsTitle}</p>
                <p className="mt-2 text-xs leading-relaxed text-muted">{t.map.noPinsHint}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

type MapViewProps = {
  embedded?: boolean;
  allowPoiAdd?: boolean;
  /** Chat sidebar: map + pins only — no settings, POI add, or pin info popups. */
  readOnly?: boolean;
};

export default function MapView({
  embedded = false,
  allowPoiAdd = false,
  readOnly = false,
}: MapViewProps) {
  const effectiveAllowPoiAdd = allowPoiAdd && !readOnly;
  const tripStore = useTripStore();
  const itinerary = tripStore.itinerary;
  const tripDestination = tripStore.destination;
  const tripId = tripStore.tripId;
  const { pins, selectedPinId, setSelectedPinId, setPendingPoi, setPanelOpen, clearPins, panelOpen, focusLocation } =
    useMapStore();
  const pushToast = useToastStore((state) => state.pushToast);
  const [runtimeMapsConfig, setRuntimeMapsConfig] = useState<RuntimeMapsConfig>({
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    googleMapsMapId: GOOGLE_MAPS_MAP_ID,
    enableMockMaps: FORCE_MOCK_MAP,
  });
  const [runtimeConfigChecked, setRuntimeConfigChecked] = useState(Boolean(GOOGLE_MAPS_API_KEY) || FORCE_MOCK_MAP);
  const useGoogleSdk = Boolean(runtimeMapsConfig.googleMapsApiKey) && !runtimeMapsConfig.enableMockMaps;

  useEffect(() => {
    if (tripStore.tripId || itinerary.length > 0) {
      return;
    }
    if (useMapStore.getState().pins.length === 0) {
      return;
    }
    clearPins();
  }, [clearPins, itinerary.length, tripStore.tripId]);

  useEffect(() => {
    if (!readOnly) {
      return;
    }
    setPendingPoi(null);
  }, [readOnly, setPendingPoi]);
  const useAdvancedMarkers = Boolean(runtimeMapsConfig.googleMapsMapId);
  const [sdkState, setSdkState] = useState<SdkState>(() => (useGoogleSdk ? "loading" : "error"));
  const [mockZoom, setMockZoom] = useState(1);
  const [mapType, setMapType] = useState<GoogleMapTypeId>(() => loadMapPreferences().mapType);
  const [enabledLayers, setEnabledLayers] = useState<Record<MapOverlayLayer, boolean>>(
    () => loadMapPreferences().enabledLayers,
  );
  const [labelVisibility, setLabelVisibility] = useState(() => loadMapPreferences().labelVisibility);
  const [showItineraryRoutes, setShowItineraryRoutes] = useState(
    () => loadMapPreferences().showItineraryRoutes,
  );
  const effectiveShowItineraryRoutes = readOnly ? true : showItineraryRoutes;
  const [mapControlsOpen, setMapControlsOpen] = useState(false);
  const [providerError, setProviderError] = useState<string | null>(null);
  const mapElementRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<GoogleMapInstance | null>(null);
  const [googleMap, setGoogleMap] = useState<GoogleMapInstance | null>(null);
  const infoWindowRef = useRef<GoogleInfoWindowInstance | null>(null);
  const markersRef = useRef<Map<string, GoogleMarkerInstance>>(new Map());
  const routeLabelMarkersRef = useRef<GoogleMarkerInstance[]>([]);
  const overlayLayersRef = useRef<Record<MapOverlayLayer, GoogleMapLayerInstance | null>>({
    traffic: null,
    transit: null,
    bicycling: null,
  });
  const requestedPlaceDetailsRef = useRef<Set<string>>(new Set());
  const routePolylinesRef = useRef<
    Array<{ polyline: GooglePolylineInstance; segmentId: string; usedDirections: boolean }>
  >([]);
  const suppressMapClickRef = useRef(false);
  const selectedPinIdRef = useRef<string | null>(selectedPinId);
  const highlightedRouteIdsRef = useRef<Set<string>>(new Set());
  const openPinInfoRef = useRef<(pinId: string) => void>(() => {});
  const refreshPinInfoRef = useRef<(pinId: string) => void>(() => {});
  const lastPinsGeometryKeyRef = useRef("");
  const prevSelectedPinIdForInfoRef = useRef<string | null>(null);

  const selectedPin = useMemo(
    () => pins.find((pin) => pin.id === selectedPinId) || null,
    [pins, selectedPinId],
  );
  const routeSegments = useMemo(() => buildItineraryRouteSegments(itinerary), [itinerary]);
  const pinStopById = useMemo(
    () => buildPinStopOrderByPinId(itinerary, pins),
    [itinerary, pins],
  );
  const highlightedItem = useMemo(
    () => findLinkedItineraryItem(itinerary, selectedPin),
    [itinerary, selectedPin],
  );
  const selectedPinRoutes = useMemo(
    () =>
      selectedPin
        ? routeSegments.filter((segment) => segmentTouchesLinkedItem(segment, highlightedItem))
        : [],
    [highlightedItem, routeSegments, selectedPin],
  );
  const highlightedRouteIds = useMemo(
    () => new Set(selectedPinRoutes.map((segment) => segment.id)),
    [selectedPinRoutes],
  );
  const [destinationViewport, setDestinationViewport] = useState<MapViewportPoint | null>(null);
  const viewportPoints = useMemo(() => {
    const fromPinsAndItinerary = collectMapViewportPoints(pins, itinerary);
    if (fromPinsAndItinerary.length > 0) {
      return fromPinsAndItinerary;
    }
    return destinationViewport ? [destinationViewport] : fromPinsAndItinerary;
  }, [destinationViewport, pins, itinerary]);

  useEffect(() => {
    const destination = tripDestination?.trim();
    if (!destination || collectMapViewportPoints(pins, itinerary).length > 0) {
      setDestinationViewport(null);
      return;
    }

    let cancelled = false;
    void geocodeQuery(destination, inferMapsRegionCode(destination))
      .then((location) => {
        if (cancelled || !location) {
          return;
        }
        setDestinationViewport({ lat: location.lat, lng: location.lng });
      })
      .catch(() => {
        if (!cancelled) {
          setDestinationViewport(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [itinerary, pins, tripDestination]);

  useEffect(() => {
    selectedPinIdRef.current = selectedPinId;
  }, [selectedPinId]);

  useEffect(() => {
    highlightedRouteIdsRef.current = highlightedRouteIds;
  }, [highlightedRouteIds]);

  const refreshPinInfoContent = useCallback(
    (pinId: string) => {
      if (sdkState !== "ready") {
        return;
      }
      const map = mapInstanceRef.current;
      const infoWindow = infoWindowRef.current;
      if (!map || !infoWindow) {
        return;
      }
      const pin = pins.find((entry) => entry.id === pinId);
      if (!pin) {
        return;
      }
      const marker = markersRef.current.get(pinId);
      if (!marker) {
        return;
      }
      const linkedItem = findLinkedItineraryItem(itinerary, pin);
      infoWindow.setContent(buildPinInfoContent(pin, linkedItem));
      infoWindow.open({ map, anchor: marker });
    },
    [itinerary, pins, sdkState],
  );

  const openPinInfoForPinId = useCallback(
    (pinId: string) => {
      if (sdkState !== "ready") {
        return;
      }
      const map = mapInstanceRef.current;
      if (!map) {
        return;
      }
      const pin = pins.find((entry) => entry.id === pinId);
      if (!pin) {
        return;
      }
      map.panTo({ lat: pin.lat, lng: pin.lng });
      refreshPinInfoContent(pinId);
    },
    [pins, refreshPinInfoContent, sdkState],
  );

  const panMapToPinId = useCallback(
    (pinId: string) => {
      if (sdkState !== "ready") {
        return;
      }
      const map = mapInstanceRef.current;
      const pin = pins.find((entry) => entry.id === pinId);
      if (!map || !pin) {
        return;
      }
      map.panTo({ lat: pin.lat, lng: pin.lng });
      map.setZoom(Math.max(map.getZoom() || 12, 15));
    },
    [pins, sdkState],
  );

  useEffect(() => {
    openPinInfoRef.current = openPinInfoForPinId;
    refreshPinInfoRef.current = refreshPinInfoContent;
  }, [openPinInfoForPinId, refreshPinInfoContent]);

  const handlePinMarkerClick = useCallback(
    (pinId: string) => {
      suppressMapClickRef.current = true;
      if (readOnly) {
        setSelectedPinId(pinId);
        return;
      }
      if (selectedPinIdRef.current === pinId) {
        setSelectedPinId(null);
        return;
      }
      setSelectedPinId(pinId);
      openPinInfoRef.current(pinId);
    },
    [readOnly, setSelectedPinId],
  );

  const handlePinInfoClose = useCallback(() => {
    setSelectedPinId(null);
  }, [setSelectedPinId]);

  useEffect(() => {
    if (readOnly || sdkState !== "ready") {
      if (readOnly) {
        infoWindowRef.current?.close?.();
      }
      prevSelectedPinIdForInfoRef.current = null;
      return;
    }
    if (!selectedPinId) {
      infoWindowRef.current?.close?.();
      prevSelectedPinIdForInfoRef.current = null;
      return;
    }
    const selectionChanged = prevSelectedPinIdForInfoRef.current !== selectedPinId;
    prevSelectedPinIdForInfoRef.current = selectedPinId;
    if (selectionChanged) {
      openPinInfoForPinId(selectedPinId);
    } else {
      refreshPinInfoContent(selectedPinId);
    }
  }, [
    itinerary,
    openPinInfoForPinId,
    pins,
    readOnly,
    refreshPinInfoContent,
    sdkState,
    selectedPinId,
  ]);

  useEffect(() => {
    if (!readOnly || sdkState !== "ready" || !selectedPinId) {
      return;
    }
    panMapToPinId(selectedPinId);
  }, [panMapToPinId, readOnly, sdkState, selectedPinId]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/runtime-config", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (cancelled || !payload || typeof payload !== "object") {
          return;
        }
        const nextConfig = {
          googleMapsApiKey:
            typeof payload.googleMapsApiKey === "string" ? payload.googleMapsApiKey.trim() : "",
          googleMapsMapId:
            typeof payload.googleMapsMapId === "string"
              ? normalizeGoogleMapsMapId(payload.googleMapsMapId.trim())
              : "",
          enableMockMaps: payload.enableMockMaps === true,
        };
        setRuntimeMapsConfig(nextConfig);
        setRuntimeConfigChecked(true);
        const shouldUseGoogle = Boolean(nextConfig.googleMapsApiKey && !nextConfig.enableMockMaps);
        if (!shouldUseGoogle) {
          setSdkState("error");
        } else {
          setSdkState((current) => {
            if (current === "ready" || mapInstanceRef.current) {
              return "ready";
            }
            return "loading";
          });
        }
      })
      .catch(() => {
        setRuntimeConfigChecked(true);
        // Build-time public env remains the fallback when the runtime route is unavailable.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (runtimeMapsConfig.enableMockMaps) {
      queueMicrotask(() => {
        setSdkState("error");
      });
      return;
    }

    if (!useGoogleSdk) {
      return;
    }

    let cancelled = false;

    const timer = window.setTimeout(() => {
      if (!mapElementRef.current || cancelled) {
        return;
      }
      if (mapInstanceRef.current) {
        setGoogleMap(mapInstanceRef.current);
        setSdkState("ready");
        return;
      }
      loadGoogleMapsApi(runtimeMapsConfig.googleMapsApiKey)
        .then((maps) => {
          if (cancelled || !mapElementRef.current) {
            return;
          }
          const initialViewport = collectMapViewportPoints(
            useMapStore.getState().pins,
            useTripStore.getState().itinerary,
          );
          const initialCenter =
            initialViewport.length === 1
              ? initialViewport[0]
              : initialViewport.length > 0
                ? {
                    lat:
                      initialViewport.reduce((sum, point) => sum + point.lat, 0) /
                      initialViewport.length,
                    lng:
                      initialViewport.reduce((sum, point) => sum + point.lng, 0) /
                      initialViewport.length,
                  }
                : DEFAULT_MAP_TW_CENTER;
          const mapOptions: Record<string, unknown> = {
            center: initialCenter,
            zoom: initialViewport.length === 1 ? 14 : DEFAULT_MAP_TW_ZOOM,
            mapTypeId: loadMapPreferences().mapType,
            streetViewControl: false,
            fullscreenControl: false,
            mapTypeControl: false,
            clickableIcons: effectiveAllowPoiAdd,
          };
          if (useAdvancedMarkers) {
            mapOptions.mapId = runtimeMapsConfig.googleMapsMapId;
          }
          mapOptions.styles = buildMapLabelStyles(loadMapPreferences().labelVisibility);
          mapInstanceRef.current = new maps.Map(mapElementRef.current, mapOptions);
          setGoogleMap(mapInstanceRef.current);
          infoWindowRef.current = new maps.InfoWindow();
          setSdkState("ready");
          setProviderError(null);
        })
        .catch((error) => {
          if (cancelled) {
            return;
          }
          setSdkState("error");
          setProviderError(error instanceof Error ? error.message : t.map.loadFailed);
          pushToast({
            variant: "error",
            title: t.map.fallbackMode,
            description: error instanceof Error ? error.message : t.map.sdkLoadError,
          });
        });
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [pushToast, runtimeMapsConfig.enableMockMaps, runtimeMapsConfig.googleMapsApiKey, runtimeMapsConfig.googleMapsMapId, useAdvancedMarkers, useGoogleSdk]);

  useEffect(() => {
    if (!useGoogleSdk) {
      return;
    }
    const onAuthFailure = () => {
      setSdkState("error");
      setProviderError(t.map.authError);
      pushToast({
        variant: "error",
        title: t.map.fallbackMode,
        description: t.map.authError,
      });
    };
    window.addEventListener(AIYO_MAPS_AUTH_FAILURE_EVENT, onAuthFailure);
    return () => window.removeEventListener(AIYO_MAPS_AUTH_FAILURE_EVENT, onAuthFailure);
  }, [pushToast, useGoogleSdk]);

  useEffect(() => {
    if (!useGoogleSdk) {
      return;
    }
    const onTargetBlocked = () => {
      setSdkState("error");
      setProviderError(`${t.map.apiTargetBlockedError} ${t.map.apiTargetBlockedHint}`);
      pushToast({
        variant: "error",
        title: t.map.fallbackMode,
        description: t.map.apiTargetBlockedError,
      });
    };
    const onWindowError = (event: ErrorEvent) => {
      const message = event.message ?? "";
      if (!isGoogleMapsTargetBlockedMessage(message)) {
        return;
      }
      window.dispatchEvent(new CustomEvent(AIYO_MAPS_TARGET_BLOCKED_EVENT));
    };
    window.addEventListener(AIYO_MAPS_TARGET_BLOCKED_EVENT, onTargetBlocked);
    window.addEventListener("error", onWindowError);
    return () => {
      window.removeEventListener(AIYO_MAPS_TARGET_BLOCKED_EVENT, onTargetBlocked);
      window.removeEventListener("error", onWindowError);
    };
  }, [pushToast, useGoogleSdk]);

  useEffect(() => {
    if (!effectiveAllowPoiAdd || sdkState !== "ready" || !mapInstanceRef.current || !useGoogleSdk) {
      return;
    }
    const map = mapInstanceRef.current;
    const listener = map.addListener?.("click", (event: { placeId?: string; stop?: () => void; latLng?: { lat: () => number; lng: () => number } }) => {
      if (suppressMapClickRef.current) {
        suppressMapClickRef.current = false;
        return;
      }
      const lat = event.latLng?.lat();
      const lng = event.latLng?.lng();
      if (lat == null || lng == null) {
        return;
      }
      const placeId = event.placeId?.trim();
      if (placeId) {
        event.stop?.();
      }
      setSelectedPinId(null);
      setPendingPoi({
        placeId: placeId || undefined,
        lat,
        lng,
      });
    });
    return () => {
      listener?.remove?.();
    };
  }, [effectiveAllowPoiAdd, sdkState, setPendingPoi, setSelectedPinId, useGoogleSdk]);

  useEffect(() => {
    if (sdkState !== "ready" || !mapInstanceRef.current) {
      return;
    }
    mapInstanceRef.current.setMapTypeId(mapType);
  }, [mapType, sdkState]);

  useEffect(() => {
    const maps = window.google?.maps;
    const map = mapInstanceRef.current;
    if (sdkState !== "ready" || !maps || !map) {
      return;
    }

    const layers = overlayLayersRef.current;
    layers.traffic ??= new maps.TrafficLayer();
    layers.transit ??= new maps.TransitLayer();
    layers.bicycling ??= new maps.BicyclingLayer();

    layers.traffic?.setMap(enabledLayers.traffic ? map : null);
    layers.transit?.setMap(enabledLayers.transit ? map : null);
    layers.bicycling?.setMap(enabledLayers.bicycling ? map : null);

    return () => {
      layers.traffic?.setMap(null);
      layers.transit?.setMap(null);
      layers.bicycling?.setMap(null);
    };
  }, [enabledLayers, sdkState]);

  useEffect(() => {
    if (sdkState !== "ready" || !mapInstanceRef.current) {
      return;
    }
    mapInstanceRef.current.setOptions?.({
      styles: buildMapLabelStyles(labelVisibility),
      clickableIcons: effectiveAllowPoiAdd,
    });
  }, [effectiveAllowPoiAdd, labelVisibility, sdkState]);

  useEffect(() => {
    if (!useGoogleSdk || sdkState !== "ready" || !mapInstanceRef.current || !mapElementRef.current) {
      return;
    }
    const map = mapInstanceRef.current;
    const el = mapElementRef.current;

    type MapsWithEvent = NonNullable<typeof window.google>["maps"] & {
      event?: { trigger: (instance: typeof map, eventName: string) => void };
    };
    const triggerResize = () => {
      const mapsApi = window.google?.maps as MapsWithEvent | undefined;
      try {
        mapsApi?.event?.trigger(map, "resize");
      } catch {
        /* ignore unsupported internal trigger */
      }
    };

    triggerResize();
    const ro = new ResizeObserver(() => {
      requestAnimationFrame(triggerResize);
    });
    ro.observe(el);
    window.addEventListener("orientationchange", triggerResize);

    const onWinResize = () => requestAnimationFrame(triggerResize);
    window.addEventListener("resize", onWinResize);

    return () => {
      ro.disconnect();
      window.removeEventListener("orientationchange", triggerResize);
      window.removeEventListener("resize", onWinResize);
    };
  }, [sdkState, useGoogleSdk]);

  useEffect(() => {
    if (readOnly || !runtimeConfigChecked || !runtimeMapsConfig.googleMapsApiKey || pins.length === 0) {
      return;
    }

    const entries = pins
      .map((pin) => ({ pin, linkedItem: findLinkedItineraryItem(itinerary, pin) }))
      .filter(({ pin, linkedItem }) => needsPlaceDetails(pin, linkedItem))
      .map(({ pin, linkedItem }) => ({
        pinId: pin.id,
        key: detailsRequestKey(pin, linkedItem),
        name: pin.name || linkedItem?.location?.name || "",
        placeId: pin.placeId || linkedItem?.location?.placeId || undefined,
        lat: pin.lat,
        lng: pin.lng,
        address: pin.address || linkedItem?.location?.address,
        linkedItemId: linkedItem?.id,
        linkedItemDay: linkedItem?.dayNumber,
      }))
      .filter((entry) => entry.name && !requestedPlaceDetailsRef.current.has(entry.key));

    const cachedPatches = new Map<string, Partial<MapPinType>>();
    const candidates = entries
      .filter((entry) => {
        const cached = readPlaceDetailsCache(entry.key);
        if (!cached) {
          return true;
        }
        requestedPlaceDetailsRef.current.add(entry.key);
        if (cached.details && Object.values(cached.details).some((value) => value !== undefined && value !== "")) {
          cachedPatches.set(entry.pinId, normalizePhotoPatch(cached.details));
        }
        return false;
      })
      .slice(0, 6);

    if (cachedPatches.size > 0) {
      const currentPins = useMapStore.getState().pins;
      useMapStore.getState().setPins(
        currentPins.map((pin) => {
          const patch = cachedPatches.get(pin.id);
          return patch ? mergePinDetails(pin, patch) : pin;
        }),
      );

      const trip = useTripStore.getState();
      entries.forEach((entry) => {
        const patch = cachedPatches.get(entry.pinId);
        if (!patch || !entry.linkedItemId || !entry.linkedItemDay) {
          return;
        }
        const day = trip.itinerary.find((candidateDay) => candidateDay.dayNumber === entry.linkedItemDay);
        const item = day?.items.find((candidateItem) => candidateItem.id === entry.linkedItemId);
        if (!item?.location) {
          return;
        }
        trip.updateItineraryItem(entry.linkedItemDay, entry.linkedItemId, {
          location: mergeLocationDetails(item.location, patch),
        });
      });
    }

    if (candidates.length === 0) {
      return;
    }

    let cancelled = false;
    candidates.forEach((candidate) => requestedPlaceDetailsRef.current.add(candidate.key));
    logFrontendDebugEvent("map", "place-details-request", {
      count: candidates.length,
      names: candidates.map((candidate) => candidate.name),
      withPlaceId: candidates.filter((candidate) => candidate.placeId).length,
    });

    void fetch("/api/map/place-details", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        region: tripDestination,
        places: candidates.map((candidate) => ({
          id: candidate.pinId,
          name: candidate.name,
          placeId: candidate.placeId,
          lat: candidate.lat,
          lng: candidate.lng,
          address: candidate.address,
        })),
      }),
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (cancelled || !payload?.success || !Array.isArray(payload.data?.results)) {
          logFrontendDebugEvent("map", "place-details-empty", {
            ok: Boolean(payload?.success),
          });
          return;
        }
        const patches = new Map<string, Partial<MapPinType>>();
        payload.data.results.forEach((row: { id?: string; details?: Partial<MapPinType> }) => {
          if (!row.id || !row.details) {
            return;
          }
          const candidate = candidates.find((entry) => entry.pinId === row.id);
          if (Object.values(row.details).some((value) => value !== undefined && value !== "")) {
            const normalized = normalizePhotoPatch(row.details);
            patches.set(row.id, normalized);
            if (candidate) {
              writePlaceDetailsCache(candidate.key, { details: normalized });
            }
          } else if (candidate) {
            writePlaceDetailsCache(candidate.key, { miss: true });
          }
        });
        if (patches.size === 0) {
          logFrontendDebugEvent("map", "place-details-no-patches", {
            requested: candidates.length,
          });
          return;
        }

        const currentPins = useMapStore.getState().pins;
        const nextPins = currentPins.map((pin) => {
          const patch = patches.get(pin.id);
          return patch ? mergePinDetails(pin, patch) : pin;
        });
        useMapStore.getState().setPins(nextPins);

        const trip = useTripStore.getState();
        candidates.forEach((candidate) => {
          const patch = patches.get(candidate.pinId);
          if (!patch || !candidate.linkedItemId || !candidate.linkedItemDay) {
            return;
          }
          const day = trip.itinerary.find((entry) => entry.dayNumber === candidate.linkedItemDay);
          const item = day?.items.find((entry) => entry.id === candidate.linkedItemId);
          if (!item?.location) {
            return;
          }
          trip.updateItineraryItem(candidate.linkedItemDay, candidate.linkedItemId, {
            location: mergeLocationDetails(item.location, patch),
          });
        });

        logFrontendDebugEvent("map", "place-details-applied", {
          requested: candidates.length,
          patched: patches.size,
          names: candidates.filter((candidate) => patches.has(candidate.pinId)).map((candidate) => candidate.name),
        });
      })
      .catch((error) => {
        logFrontendDebugEvent("map", "place-details-failed", {
          error: error instanceof Error ? error.message : String(error),
        });
      });

    return () => {
      cancelled = true;
    };
  }, [itinerary, pins, readOnly, runtimeConfigChecked, runtimeMapsConfig.googleMapsApiKey, tripDestination]);

  useEffect(() => {
    const maps = window.google?.maps;
    if (sdkState !== "ready" || !mapInstanceRef.current || !maps) {
      return;
    }
    const mapsApi = maps;

    const geometryKey = pinsGeometryKey(pins);
    if (
      geometryKey === lastPinsGeometryKeyRef.current &&
      markersRef.current.size > 0 &&
      pins.length > 0
    ) {
      return;
    }
    lastPinsGeometryKeyRef.current = geometryKey;

    let cancelled = false;
    const map = mapInstanceRef.current;

    markersRef.current.forEach((marker) => marker.setMap(null));
    markersRef.current.clear();

    const focusPoint = focusLocationToPoint(focusLocation);
    const framePoints = viewportPoints.length > 0 ? viewportPoints : focusPoint ? [focusPoint] : [];

    function applyMapViewport() {
      if (framePoints.length === 0) {
        if (!syncService.isHydrated()) {
          return;
        }
        if (
          shouldUseTaiwanDefaultViewport({
            tripId,
            destination: tripDestination,
            points: viewportPoints,
            focusLocation,
          })
        ) {
          map.setCenter(DEFAULT_MAP_TW_CENTER);
          map.setZoom(DEFAULT_MAP_TW_ZOOM);
        }
        return;
      }

      if (framePoints.length === 1) {
        map.setCenter(framePoints[0]);
        map.setZoom(focusLocation?.zoom ?? 14);
        return;
      }

      const bounds = new mapsApi.LatLngBounds();
      framePoints.forEach((point) => bounds.extend(point));
      map.fitBounds(bounds, 72);
    }

    if (pins.length === 0) {
      applyMapViewport();
      return () => {
        cancelled = true;
      };
    }

    const bounds = new mapsApi.LatLngBounds();

    function fitMapToBounds() {
      applyMapViewport();
    }

    function reopenSelectedPinInfo() {
      if (readOnly) {
        return;
      }
      const activePinId = selectedPinIdRef.current;
      if (activePinId) {
        refreshPinInfoRef.current(activePinId);
      }
    }

    if (useAdvancedMarkers && typeof mapsApi.importLibrary === "function") {
      void mapsApi
        .importLibrary("marker")
        .then((markerLib) => {
          if (cancelled || !mapInstanceRef.current) {
            return;
          }
          const lib = markerLib as {
            AdvancedMarkerElement: new (options: Record<string, unknown>) => GoogleMarkerInstance;
          };

          pins.forEach((pin) => {
            const stopN = pinStopById.get(pin.id);
            const content = createMapPinElement(pin.color || "#5a7ea3", false, stopN);
            const marker = new lib.AdvancedMarkerElement({
              map,
              position: { lat: pin.lat, lng: pin.lng },
              title: pin.name,
              content,
            });
            marker.addListener("gmp-click", () => handlePinMarkerClick(pin.id));
            markersRef.current.set(pin.id, marker as GoogleMarkerInstance);
            bounds.extend({ lat: pin.lat, lng: pin.lng });
          });

          fitMapToBounds();
          reopenSelectedPinInfo();
        })
        .catch(() => {
          if (cancelled) {
            return;
          }
          pushToast({
            variant: "warning",
            title: t.map.advancedMarkerFailTitle,
            description: t.map.advancedMarkerFailDesc,
          });
          const fallbackBounds = new mapsApi.LatLngBounds();
          pins.forEach((pin) => {
            const marker = new mapsApi.Marker({
              map,
              position: { lat: pin.lat, lng: pin.lng },
              title: pin.name,
              icon: buildMarkerPinIcon(mapsApi, pin.color || "#5a7ea3", false, pinStopById.get(pin.id)),
            });
            marker.addListener("click", () => handlePinMarkerClick(pin.id));
            markersRef.current.set(pin.id, marker);
            fallbackBounds.extend({ lat: pin.lat, lng: pin.lng });
          });
          if (pins.length === 1) {
            map.setCenter({ lat: pins[0].lat, lng: pins[0].lng });
            map.setZoom(14);
          } else {
            map.fitBounds(fallbackBounds, 72);
          }
          reopenSelectedPinInfo();
        });
      return () => {
        cancelled = true;
      };
    }

    pins.forEach((pin) => {
      const marker = new mapsApi.Marker({
        map,
        position: { lat: pin.lat, lng: pin.lng },
        title: pin.name,
        icon: buildMarkerPinIcon(mapsApi, pin.color || "#5a7ea3", false, pinStopById.get(pin.id)),
      });
      marker.addListener("click", () => handlePinMarkerClick(pin.id));
      markersRef.current.set(pin.id, marker);
      bounds.extend({ lat: pin.lat, lng: pin.lng });
    });

    fitMapToBounds();
    reopenSelectedPinInfo();

    return () => {
      cancelled = true;
    };
  }, [
    focusLocation,
    handlePinMarkerClick,
    pins,
    pushToast,
    sdkState,
    tripDestination,
    tripId,
    readOnly,
    useAdvancedMarkers,
    viewportPoints,
  ]);

  useEffect(() => {
    const maps = window.google?.maps;
    if (sdkState !== "ready" || !mapInstanceRef.current || !maps) {
      return;
    }
    const mapsApi = maps;

    let cancelled = false;
    let directionsTimer: number | NodeJS.Timeout | undefined;

    const clearRouteOverlays = () => {
      routePolylinesRef.current.forEach(({ polyline }) => polyline.setMap(null));
      routePolylinesRef.current = [];
      routeLabelMarkersRef.current.forEach((marker) => marker.setMap(null));
      routeLabelMarkersRef.current = [];
    };

    if (!effectiveShowItineraryRoutes || pins.length === 0 || routeSegments.length === 0) {
      clearRouteOverlays();
      useMapStore.getState().setItinerarySegmentDurations({});
      return;
    }

    directionsTimer = window.setTimeout(() => {
      void (async () => {
        let resolved: Awaited<ReturnType<typeof fetchItineraryRoutePaths>>;
        try {
          resolved = await fetchItineraryRoutePaths(mapsApi, routeSegments, {
            cancelled: () => cancelled,
            region: inferMapsRegionCode(tripDestination),
          });
        } catch {
          logFrontendDebugEvent("map", "routes-fetch-threw", {
            segments: routeSegments.length,
          });
          return;
        }
        if (cancelled || !mapInstanceRef.current) {
          return;
        }
        const map = mapInstanceRef.current;
        const routeBounds = new mapsApi.LatLngBounds();
        pins.forEach((pin) => {
          routeBounds.extend({ lat: pin.lat, lng: pin.lng });
        });

        const nextMinutes: Record<string, number> = {};
        clearRouteOverlays();
        resolved.forEach((entry) => {
          const { segment, path, usedDirections, durationSeconds } = entry;
          const isHighlighted = highlightedRouteIdsRef.current.has(segment.id);
          const displayMinutes = segmentRouteDisplayMinutes(segment, durationSeconds, usedDirections);
          nextMinutes[segment.id] = displayMinutes;

          const polyline = new mapsApi.Polyline({
            map,
            path,
            strokeColor: segment.color,
            strokeOpacity: isHighlighted ? 1 : usedDirections ? 0.82 : 0.58,
            strokeWeight: isHighlighted ? 7 : usedDirections ? 5 : 4,
            geodesic: !usedDirections,
            zIndex: isHighlighted ? 980 : 950,
          });
          routePolylinesRef.current.push({
            polyline,
            segmentId: segment.id,
            usedDirections,
          });
          path.forEach((p) => routeBounds.extend(p));

          const mid = path[Math.floor(path.length / 2)]!;
          const labelMarker = new mapsApi.Marker({
            map,
            position: mid,
            clickable: !readOnly,
            title: `${segment.fromName} → ${segment.toName}`,
            zIndex: 980,
            icon: {
              path: mapsApi.SymbolPath.CIRCLE,
              scale: 0,
              fillOpacity: 0,
              strokeOpacity: 0,
            },
            label: {
              text: `${segment.transport} · ${formatRouteMinutes(displayMinutes)}`,
              color: segment.color,
              fontSize: "11px",
              fontWeight: "700",
            },
          });
          if (!readOnly) {
            labelMarker.addListener("click", () => {
              if (!infoWindowRef.current) {
                return;
              }
              infoWindowRef.current.setContent(buildRouteSegmentInfoContent(segment, displayMinutes));
              infoWindowRef.current.open({ map, anchor: labelMarker });
            });
            polyline.addListener?.("click", () => {
              if (!infoWindowRef.current) {
                return;
              }
              infoWindowRef.current.setContent(buildRouteSegmentInfoContent(segment, displayMinutes));
              infoWindowRef.current.open({ map, anchor: labelMarker });
              map.panTo(mid);
            });
          }
          routeLabelMarkersRef.current.push(labelMarker);
        });

        useMapStore.getState().setItinerarySegmentDurations(nextMinutes);
        logFrontendDebugEvent("map", "routes-drawn", {
          requested: routeSegments.length,
          resolved: resolved.length,
          directions: resolved.filter((entry) => entry.usedDirections).length,
          fallback: resolved.filter((entry) => !entry.usedDirections).length,
          polylines: routePolylinesRef.current.length,
        });

        const activePinId = selectedPinIdRef.current;
        if (activePinId && !readOnly) {
          refreshPinInfoRef.current(activePinId);
        } else if (resolved.some((entry) => entry.usedDirections)) {
          map.fitBounds(routeBounds, 72);
        }
      })();
    }, 420);

    return () => {
      cancelled = true;
      clearTimeout(directionsTimer);
    };
  }, [effectiveShowItineraryRoutes, pins, readOnly, routeSegments, sdkState, tripDestination]);

  useEffect(() => {
    if (sdkState !== "ready" || !effectiveShowItineraryRoutes) {
      return;
    }
    routePolylinesRef.current.forEach(({ polyline, segmentId, usedDirections }) => {
      const isHighlighted = highlightedRouteIds.has(segmentId);
      polyline.setOptions?.({
        strokeOpacity: isHighlighted ? 1 : usedDirections ? 0.82 : 0.58,
        strokeWeight: isHighlighted ? 7 : usedDirections ? 5 : 4,
        zIndex: isHighlighted ? 980 : 950,
      });
    });
  }, [effectiveShowItineraryRoutes, highlightedRouteIds, sdkState]);

  useEffect(() => {
    const maps = window.google?.maps;
    if (sdkState !== "ready" || !maps) {
      return;
    }

    pins.forEach((pin) => {
      const marker = markersRef.current.get(pin.id);
      if (!marker) {
        return;
      }
      const selected = pin.id === selectedPinId;
      const stopN = pinStopById.get(pin.id);
      if (useAdvancedMarkers) {
        marker.content = createMapPinElement(pin.color || "#5a7ea3", selected, stopN);
        return;
      }
      marker.setIcon(buildMarkerPinIcon(maps, pin.color || "#5a7ea3", selected, stopN));
    });
  }, [pinStopById, pins, sdkState, selectedPinId, useAdvancedMarkers]);

  useEffect(
    () => () => {
      markersRef.current.forEach((marker) => marker.setMap(null));
      markersRef.current.clear();
      routePolylinesRef.current.forEach(({ polyline }) => polyline.setMap(null));
      routePolylinesRef.current = [];
      routeLabelMarkersRef.current.forEach((marker) => marker.setMap(null));
      routeLabelMarkersRef.current = [];
    },
    [],
  );

  function changeMockZoom(delta: number) {
    setMockZoom((z) =>
      Math.min(2.3, Math.max(0.5, Math.round((z + delta) * 1000) / 1000)),
    );
  }

  function changeZoom(delta: number) {
    if (sdkState !== "ready" || !mapInstanceRef.current) {
      return;
    }
    const currentZoom = mapInstanceRef.current.getZoom() || 12;
    mapInstanceRef.current.setZoom(currentZoom + delta);
  }

  function focusSelectedPin() {
    if (sdkState !== "ready" || !mapInstanceRef.current) {
      return;
    }
    const target = selectedPin || pins[0];
    if (!target) {
      return;
    }
    mapInstanceRef.current.panTo({ lat: target.lat, lng: target.lng });
    mapInstanceRef.current.setZoom(14);
  }

  function setMapDisplayType(nextType: GoogleMapTypeId) {
    setMapType(nextType);
    if (sdkState === "ready" && mapInstanceRef.current) {
      mapInstanceRef.current.setMapTypeId(nextType);
    }
    saveMapPreferences({ mapType: nextType, enabledLayers, labelVisibility, showItineraryRoutes });
  }

  function toggleOverlayLayer(layer: MapOverlayLayer) {
    setEnabledLayers((current) => {
      const next = {
        ...current,
        [layer]: !current[layer],
      };
      saveMapPreferences({ mapType, enabledLayers: next, labelVisibility, showItineraryRoutes });
      return next;
    });
  }

  function toggleLabelVisibility(key: MapLabelToggleKey) {
    setLabelVisibility((current) => {
      const next = {
        ...current,
        [key]: !current[key],
      };
      saveMapPreferences({ mapType, enabledLayers, labelVisibility: next, showItineraryRoutes });
      return next;
    });
  }

  function toggleShowItineraryRoutes() {
    setShowItineraryRoutes((current) => {
      const next = !current;
      saveMapPreferences({
        mapType,
        enabledLayers,
        labelVisibility,
        showItineraryRoutes: next,
      });
      return next;
    });
  }

  const showRealMap = useGoogleSdk && sdkState !== "error";
  const mapReady = sdkState === "ready";
  const mapControlsInsetWhenPanelOpen = panelOpen && !embedded;
  const mapControlsPositionClass = cn(
    mapControlsInsetWhenPanelOpen ? "max-lg:left-4 max-lg:right-auto" : "right-4",
  );
  const mapControlsRightStyle = mapControlsInsetWhenPanelOpen
    ? { right: MAP_CONTROLS_OFFSET_WITH_PANEL }
    : undefined;

  return (
    <div
      data-testid="map-view"
      className={cn(
        "relative w-full overflow-hidden rounded-2xl border-2 border-border bg-surface shadow-soft-lg ring-1 ring-black/5",
        embedded ? "h-full" : "flex min-h-0 flex-1 flex-col",
      )}
    >
      {showRealMap ? (
        <div className={cn("relative z-0 min-h-0", embedded ? "h-full" : "flex-1")}>
          <div
            ref={mapElementRef}
            className={cn(
              "absolute inset-0 bg-[var(--surface-elevated)]",
              embedded ? "min-h-0" : "min-h-[200px]",
            )}
          />
        </div>
      ) : (
        <div className={cn("relative z-0 min-h-0 overflow-hidden", embedded ? "h-full" : "flex-1")}>
          <MockMapFallback
            pins={pins}
            pinStopById={pinStopById}
            routeSegments={routeSegments}
            highlightedRouteIds={highlightedRouteIds}
            showItineraryRoutes={effectiveShowItineraryRoutes}
            viewportPoints={viewportPoints}
            selectedPinId={selectedPinId}
            onPinMarkerClick={handlePinMarkerClick}
            onPinInfoClose={handlePinInfoClose}
            itinerary={itinerary}
            zoom={mockZoom}
            readOnly={readOnly}
          />
        </div>
      )}

      {showRealMap && effectiveAllowPoiAdd ? (
        <MapPoiAddOverlay
          map={googleMap}
          mapReady={mapReady}
          tripDestination={tripDestination}
          onMapClickSuppress={() => {
            suppressMapClickRef.current = true;
          }}
        />
      ) : null}

      {!showRealMap && runtimeMapsConfig.enableMockMaps && (
        <div className="absolute left-0 right-0 top-14 z-[12] flex justify-center px-6">
          <p className="max-w-xl rounded-xl border border-primary/35 bg-peach-light/95 px-4 py-2 text-center text-[11px] font-medium leading-relaxed text-foreground shadow-soft backdrop-blur-sm sm:text-xs">
            {t.map.mockForcedBanner}
          </p>
        </div>
      )}

      {!showRealMap && runtimeConfigChecked && !runtimeMapsConfig.enableMockMaps && !runtimeMapsConfig.googleMapsApiKey && (
        <div className="absolute left-0 right-0 top-14 z-[12] flex justify-center px-6">
          <p className="max-w-xl rounded-xl border border-secondary/35 bg-secondary-light/95 px-4 py-2 text-center text-[11px] font-medium leading-relaxed text-foreground shadow-soft backdrop-blur-sm sm:text-xs">
            {t.map.keyMissingBanner}
          </p>
        </div>
      )}

      {!readOnly && (
      <div
        className={cn("absolute top-4 z-[11]", mapControlsPositionClass)}
        style={mapControlsRightStyle}
      >
        <button
          type="button"
          onClick={() => setMapControlsOpen((open) => !open)}
          aria-label={t.map.mapControls}
          aria-expanded={mapControlsOpen}
          disabled={showRealMap && !mapReady}
          className={cn(
            "flex size-9 cursor-pointer items-center justify-center rounded-xl border border-black bg-black text-white shadow-soft transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-45",
            mapControlsOpen && "ring-2 ring-white/25",
          )}
        >
          <Settings
            className={cn(
              "size-4 transition-transform duration-300 ease-out",
              mapControlsOpen && "rotate-90",
            )}
          />
        </button>
      </div>
      )}

      {!readOnly && mapControlsOpen && (
        <div
          className={cn(
            "absolute top-14 z-[12] max-h-[min(32rem,calc(100vh-5rem))] w-64 overflow-y-auto rounded-2xl border border-border-light bg-surface/95 p-3 text-xs shadow-soft-lg backdrop-blur-md [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden",
            mapControlsPositionClass,
          )}
          style={mapControlsRightStyle}
        >
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-foreground">{t.map.mapControls}</p>
            {!mapReady && showRealMap && (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary">
                {t.map.loadingLabel}
              </span>
            )}
          </div>

          <div className="mt-3 rounded-xl border border-black p-2">
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => (showRealMap ? changeZoom(1) : changeMockZoom(0.18))}
                disabled={showRealMap && !mapReady}
                aria-label={t.map.mapZoomIn}
                title={t.map.mapZoomIn}
                className="flex h-9 w-full items-center justify-center rounded-xl border border-border-light bg-white text-foreground transition-colors hover:border-primary/30 hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-45"
              >
                <ZoomIn className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => (showRealMap ? changeZoom(-1) : changeMockZoom(-0.18))}
                disabled={showRealMap && !mapReady}
                aria-label={t.map.mapZoomOut}
                title={t.map.mapZoomOut}
                className="flex h-9 w-full items-center justify-center rounded-xl border border-border-light bg-white text-foreground transition-colors hover:border-primary/30 hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-45"
              >
                <ZoomOut className="size-4" />
              </button>
              <button
                type="button"
                onClick={focusSelectedPin}
                disabled={showRealMap && (!mapReady || pins.length === 0)}
                aria-label={t.map.mapFocusSelectedPin}
                title={t.map.mapFocusSelectedPin}
                className="flex h-9 w-full items-center justify-center rounded-xl border border-border-light bg-white text-foreground transition-colors hover:border-primary/30 hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-45"
              >
                <Navigation className="size-4" />
              </button>
            </div>
          </div>

          <div className="mt-3 rounded-xl border border-black p-2">
            <div className="grid grid-cols-2 gap-2">
              {MAP_TYPE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setMapDisplayType(option.value)}
                  disabled={showRealMap && !mapReady}
                  className={cn(
                    "rounded-xl border px-2.5 py-2 font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45",
                    mapType === option.value
                      ? "border-primary bg-primary text-white"
                      : "border-border-light bg-white text-foreground hover:border-primary/30 hover:bg-primary/5",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4">
            <button
              type="button"
              onClick={toggleShowItineraryRoutes}
              disabled={!mapReady}
              className={cn(
                "flex w-full items-center justify-between rounded-xl border px-3 py-2 font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45",
                showItineraryRoutes
                  ? "border-secondary/40 bg-secondary/15 text-foreground"
                  : "border-border-light bg-white text-foreground hover:border-primary/30 hover:bg-primary/5",
              )}
            >
              <span>{t.map.mapShowItineraryRoutes}</span>
              <span
                className={cn(
                  "h-5 w-9 rounded-full p-0.5 transition-colors",
                  showItineraryRoutes ? "bg-primary" : "bg-border",
                )}
                aria-hidden
              >
                <span
                  className={cn(
                    "block size-4 rounded-full bg-white shadow-sm transition-transform",
                    showItineraryRoutes && "translate-x-4",
                  )}
                />
              </span>
            </button>
          </div>

          <div className="mt-4">
            <div className="flex flex-col gap-2">
              {MAP_LAYER_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => toggleOverlayLayer(option.value)}
                  disabled={!mapReady}
                  className={cn(
                    "flex items-center justify-between rounded-xl border px-3 py-2 font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45",
                    enabledLayers[option.value]
                      ? "border-secondary/40 bg-secondary/15 text-foreground"
                      : "border-border-light bg-white text-foreground hover:border-primary/30 hover:bg-primary/5",
                  )}
                >
                  <span>{option.label}</span>
                  <span
                    className={cn(
                      "h-5 w-9 rounded-full p-0.5 transition-colors",
                      enabledLayers[option.value] ? "bg-primary" : "bg-border",
                    )}
                    aria-hidden
                  >
                    <span
                      className={cn(
                        "block size-4 rounded-full bg-white shadow-sm transition-transform",
                        enabledLayers[option.value] && "translate-x-4",
                      )}
                    />
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4">
            <div className="flex flex-col gap-2">
              {MAP_LABEL_TOGGLE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => toggleLabelVisibility(option.value)}
                  disabled={!mapReady}
                  className={cn(
                    "flex items-center justify-between rounded-xl border px-3 py-2 font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45",
                    labelVisibility[option.value]
                      ? "border-secondary/40 bg-secondary/15 text-foreground"
                      : "border-border-light bg-white text-foreground hover:border-primary/30 hover:bg-primary/5",
                  )}
                >
                  <span>{option.label}</span>
                  <span
                    className={cn(
                      "h-5 w-9 rounded-full p-0.5 transition-colors",
                      labelVisibility[option.value] ? "bg-primary" : "bg-border",
                    )}
                    aria-hidden
                  >
                    <span
                      className={cn(
                        "block size-4 rounded-full bg-white shadow-sm transition-transform",
                        labelVisibility[option.value] && "translate-x-4",
                      )}
                    />
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {providerError && sdkState === "error" && useGoogleSdk && (
        <div className="absolute left-4 top-32 z-[11] flex w-80 max-w-[calc(100%-2rem)] items-start gap-3 rounded-2xl border-2 border-danger/25 bg-peach-light/90 px-4 py-3 text-sm text-foreground shadow-soft-lg">
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-danger" />
          <div>
            <p className="font-semibold">{t.map.fallbackMode}</p>
            <p className="mt-1 text-xs text-muted">{providerError}</p>
          </div>
        </div>
      )}

      {sdkState === "error" && runtimeMapsConfig.googleMapsApiKey && !runtimeMapsConfig.enableMockMaps && (
        <button
          onClick={() => window.location.reload()}
          className="absolute bottom-4 right-4 z-20 flex items-center gap-2 rounded-xl bg-surface/90 px-3 py-2 text-xs font-medium text-foreground shadow-soft backdrop-blur-sm hover:bg-surface"
        >
          <RefreshCcw className="size-3.5" />
          {t.map.retrySdk}
        </button>
      )}
    </div>
  );
}
