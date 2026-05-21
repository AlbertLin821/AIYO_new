"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { AlertCircle, Layers, MapPin, Navigation, RefreshCcw, ZoomIn, ZoomOut } from "lucide-react";
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

const GOOGLE_MAPS_API_KEY = (
  process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || ""
).trim();
/** 與伺服端 ENABLE_MOCK_MAPS 對齊：建置時由 next.config 注入。 */
const FORCE_MOCK_MAP = process.env.NEXT_PUBLIC_ENABLE_MOCK_MAPS === "true";
/** Vector map ID from Cloud Console (Map Management). Required for AdvancedMarkerElement; omit to use legacy Marker. */
const GOOGLE_MAPS_MAP_ID = (process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || "").trim();

/** 無任何標記時：地圖預設對準台灣本島（略放大、視覺置中）。 */
const DEFAULT_MAP_TW_CENTER = { lat: 23.62, lng: 121.0 };
const DEFAULT_MAP_TW_ZOOM = 8;
const PLACE_DETAILS_CACHE_PREFIX = "aiyo:place-details:";
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

/** Mock 地圖無標記時的示意範圍（約略台灣區域）。 */
const MOCK_TW_LAT_RANGE = { min: 21.95, max: 25.35 };
const MOCK_TW_LNG_RANGE = { min: 119.35, max: 122.05 };

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

function normalizeMapId(value: string): string {
  if (!value || /NEXT_PUBLIC_|GOOGLE_MAPS_API_KEY|Frontend_/i.test(value)) {
    return "";
  }
  return value;
}

function escapeHtml(value: string | number | undefined): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

const WEEKDAY_ORDER = ["週一", "週二", "週三", "週四", "週五", "週六", "週日"] as const;
const WEEKDAY_ALIASES: Record<string, number> = {
  "週一": 0,
  "星期一": 0,
  "禮拜一": 0,
  Monday: 0,
  Mon: 0,
  "週二": 1,
  "星期二": 1,
  "禮拜二": 1,
  Tuesday: 1,
  Tue: 1,
  "週三": 2,
  "星期三": 2,
  "禮拜三": 2,
  Wednesday: 2,
  Wed: 2,
  "週四": 3,
  "星期四": 3,
  "禮拜四": 3,
  Thursday: 3,
  Thu: 3,
  "週五": 4,
  "星期五": 4,
  "禮拜五": 4,
  Friday: 4,
  Fri: 4,
  "週六": 5,
  "星期六": 5,
  "禮拜六": 5,
  Saturday: 5,
  Sat: 5,
  "週日": 6,
  "週天": 6,
  "星期日": 6,
  "星期天": 6,
  "禮拜日": 6,
  "禮拜天": 6,
  Sunday: 6,
  Sun: 6,
};

function normalizeOpeningHours(value?: string): Array<{ day: string; hours: string }> {
  const raw = value?.trim();
  if (!raw) {
    return [];
  }
  const rows = raw
    .split(/[；;\n\r]+/u)
    .map((row) => row.trim())
    .filter(Boolean);
  const byDay = new Map<number, string>();
  const unmatched: Array<{ day: string; hours: string }> = [];

  for (const row of rows) {
    const rangeMatch = row.match(/(週一|星期一|禮拜一)\s*(?:至|到|-|–|~)\s*(週日|週天|星期日|星期天|禮拜日|禮拜天)\s*[:：]?\s*(.+)$/u);
    if (rangeMatch?.[3]) {
      WEEKDAY_ORDER.forEach((_, index) => byDay.set(index, rangeMatch[3]!.trim()));
      continue;
    }

    const aliases = Object.keys(WEEKDAY_ALIASES).sort((left, right) => right.length - left.length);
    const alias = aliases.find((candidate) => row.toLowerCase().startsWith(candidate.toLowerCase()));
    if (!alias) {
      unmatched.push({ day: "", hours: row });
      continue;
    }
    const dayIndex = WEEKDAY_ALIASES[alias];
    const hours = row
      .slice(alias.length)
      .replace(/^[\s:：,，-]+/u, "")
      .trim();
    byDay.set(dayIndex, hours || row);
  }

  const ordered = WEEKDAY_ORDER.flatMap((day, index) => {
    const hours = byDay.get(index);
    return hours ? [{ day, hours }] : [];
  });
  return ordered.length > 0 ? ordered : unmatched;
}

function buildOpeningHoursInfoHtml(value: string | undefined, empty: string): string {
  const rows = normalizeOpeningHours(value);
  if (rows.length === 0) {
    return escapeHtml(empty);
  }
  return `<ul style="list-style:none;margin:0;padding:0;display:grid;gap:3px;">${rows
    .map((row) =>
      row.day
        ? `<li><span style="display:inline-block;min-width:34px;color:#6b7280;">${escapeHtml(row.day)}</span>${escapeHtml(row.hours)}</li>`
        : `<li>${escapeHtml(row.hours)}</li>`,
    )
    .join("")}</ul>`;
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

function pinSourceLabel(source: string | undefined) {
  if (!source || source === "manual") {
    return t.map.sourceManual;
  }
  if (source === "itinerary") {
    return t.map.sourceItinerary;
  }
  if (source === "video") {
    return t.map.sourceVideo;
  }
  return source;
}

function buildLocationBackfilledPin(
  pin: MapPinType,
  linkedItem?: { time: string; title: string; type: string; transport?: string; notes?: string; location?: LocationReference },
): MapPinType {
  const location = linkedItem?.location;
  if (!location) {
    return pin;
  }
  return {
    ...pin,
    description: pin.description || linkedItem?.notes || location.description,
    address: pin.address || location.address,
    placeId: pin.placeId || location.placeId,
    photoUrl: pin.photoUrl || location.photoUrl,
    thumbnail: pin.thumbnail || location.thumbnail || location.photoUrl,
    openingHours: pin.openingHours || location.openingHours,
    phoneNumber: pin.phoneNumber || location.phoneNumber,
    website: pin.website || location.website,
    googleMapsUrl: pin.googleMapsUrl || location.googleMapsUrl,
    rating: pin.rating ?? location.rating,
    userRatingsTotal: pin.userRatingsTotal ?? location.userRatingsTotal,
    confidence: pin.confidence ?? location.confidence,
    verified: pin.verified ?? location.verified,
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

function buildRoutePlanningUrl(pin: Pick<MapPinType, "lat" | "lng" | "address" | "placeId">): string {
  const routeParams = new URLSearchParams({
    api: "1",
    destination: `${pin.lat},${pin.lng}`,
  });
  if (pin.placeId) {
    routeParams.set("destination_place_id", pin.placeId);
  }
  return `https://www.google.com/maps/dir/?${routeParams.toString()}`;
}

function buildGoogleMapsUrl(pin: Pick<MapPinType, "lat" | "lng" | "placeId" | "googleMapsUrl">): string | null {
  if (pin.googleMapsUrl) {
    return pin.googleMapsUrl;
  }
  if (!pin.placeId) {
    return null;
  }
  const params = new URLSearchParams({
    api: "1",
    query: `${pin.lat},${pin.lng}`,
    query_place_id: pin.placeId,
  });
  return `https://www.google.com/maps/search/?${params.toString()}`;
}

function buildPinInfoContent(
  pin: MapPinType,
  linkedItem?: { time: string; title: string; type: string; transport?: string; notes?: string; location?: LocationReference },
): string {
  const resolvedPin = buildLocationBackfilledPin(pin, linkedItem);
  const routeUrl = buildRoutePlanningUrl(resolvedPin);
  const googleMapsUrl = buildGoogleMapsUrl(resolvedPin);
  const thumbnail = resolvedPin.thumbnail || resolvedPin.photoUrl;
  const empty = t.map.notProvided;

  return `
    <article style="min-width:280px;max-width:340px;padding:0 0 8px;font-family:inherit;color:#1f2937;overflow:hidden;">
      <div style="height:132px;background:#eef3f7;display:flex;align-items:center;justify-content:center;overflow:hidden;border-radius:12px 12px 8px 8px;">
        ${
          thumbnail
            ? `<img src="${escapeHtml(thumbnail)}" alt="${escapeHtml(t.map.infoThumbnail)}" style="width:100%;height:100%;object-fit:cover;" />`
            : `<div style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;color:#6b7280;font-size:12px;">${escapeHtml(t.map.infoThumbnail)}</div>`
        }
      </div>
      <div style="padding:12px 8px 0;">
        <div style="display:flex;align-items:flex-start;gap:8px;">
              <div style="width:12px;height:12px;border-radius:999px;background:${escapeHtml(resolvedPin.color || "#5a7ea3")};margin-top:5px;box-shadow:0 0 0 3px rgba(255,255,255,.9),0 2px 8px rgba(0,0,0,.18);"></div>
              <div style="min-width:0;flex:1;">
            <h3 style="margin:0;font-size:16px;line-height:1.35;font-weight:700;color:#111827;">${escapeHtml(resolvedPin.name)}</h3>
            <p style="margin:4px 0 0;font-size:12px;line-height:1.45;color:#4b5563;">${escapeHtml(resolvedPin.description || t.map.noDescription)}</p>
          </div>
        </div>
      </div>
      <dl style="display:grid;grid-template-columns:72px 1fr;gap:6px 8px;margin:12px 8px 0;font-size:12px;line-height:1.45;">
        <dt style="color:#6b7280;">${escapeHtml(t.map.infoAddress)}</dt>
        <dd style="margin:0;color:#1f2937;">${escapeHtml(resolvedPin.address || empty)}</dd>
        <dt style="color:#6b7280;">${escapeHtml(t.map.infoOpeningHours)}</dt>
        <dd style="margin:0;color:#1f2937;">${buildOpeningHoursInfoHtml(resolvedPin.openingHours, empty)}</dd>
        <dt style="color:#6b7280;">${escapeHtml(t.map.infoPhone)}</dt>
        <dd style="margin:0;color:#1f2937;">${escapeHtml(resolvedPin.phoneNumber || empty)}</dd>
        <dt style="color:#6b7280;">${escapeHtml(t.map.infoSource)}</dt>
        <dd style="margin:0;color:#1f2937;">${escapeHtml(pinSourceLabel(resolvedPin.source))}${resolvedPin.dayNumber ? ` · D${escapeHtml(resolvedPin.dayNumber)}` : ""}</dd>
      </dl>
      <a href="${escapeHtml(routeUrl)}" target="_blank" rel="noopener noreferrer" style="display:flex;align-items:center;justify-content:center;margin:12px 8px 0;padding:9px 12px;border-radius:10px;background:#426991;color:white;font-size:12px;font-weight:700;text-decoration:none;">
        ${escapeHtml(t.map.infoRoute)}
      </a>
      ${
        googleMapsUrl
          ? `<a href="${escapeHtml(googleMapsUrl)}" target="_blank" rel="noopener noreferrer" style="display:flex;align-items:center;justify-content:center;margin:8px 8px 0;padding:9px 12px;border-radius:10px;border:1px solid #cbd5e1;color:#1f2937;font-size:12px;font-weight:700;text-decoration:none;">
              ${escapeHtml(t.map.infoGoogleMaps)}
            </a>`
          : ""
      }
    </article>
  `;
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
  selectedPinId,
  setSelectedPinId,
  zoom,
}: {
  pins: MapPinType[];
  pinStopById: ReadonlyMap<string, number>;
  routeSegments: ItineraryRouteSegment[];
  highlightedRouteIds: Set<string>;
  selectedPinId: string | null;
  setSelectedPinId: (value: string | null) => void;
  zoom: number;
}) {
  const [hoveredPin, setHoveredPin] = useState<string | null>(null);
  const segmentDirectionsMinutes = useMapStore((s) => s.segmentDirectionsMinutes);

  const lats = pins.map((pin) => pin.lat);
  const lngs = pins.map((pin) => pin.lng);
  const latRange =
    lats.length > 0
      ? { min: Math.min(...lats) - 0.012, max: Math.max(...lats) + 0.012 }
      : MOCK_TW_LAT_RANGE;
  const lngRange =
    lngs.length > 0
      ? { min: Math.min(...lngs) - 0.012, max: Math.max(...lngs) + 0.012 }
      : MOCK_TW_LNG_RANGE;

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
            {routeSegments.map((segment) => {
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
              })}
          </svg>

          {pins.map((pin) => {
            const pos = getPos(pin.lat, pin.lng);
            const isSelected = pin.id === selectedPinId;
            return (
              <motion.button
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
                onClick={() => setSelectedPinId(pin.id)}
              >
                <div className="group relative cursor-pointer transition-transform group-hover:scale-105">
                  <MapPinMarker
                    fill={pin.color || "#5a7ea3"}
                    selected={isSelected}
                    stopOrder={pinStopById.get(pin.id)}
                    decorative
                  />
                  {hoveredPin === pin.id && (
                    <div className="absolute bottom-full left-1/2 z-10 mb-2 -translate-x-1/2 whitespace-nowrap rounded-xl border border-border bg-surface px-3 py-2 text-left shadow-soft-lg">
                      <p className="text-xs font-semibold text-foreground">{pin.name}</p>
                      <p className="mt-0.5 max-w-[220px] text-[10px] text-muted">{pin.description}</p>
                    </div>
                  )}
                </div>
              </motion.button>
            );
          })}

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

export default function MapView() {
  const tripStore = useTripStore();
  const itinerary = tripStore.itinerary;
  const tripDestination = tripStore.destination;
  const { pins, selectedPinId, setSelectedPinId, clearPins } = useMapStore();
  const pushToast = useToastStore((state) => state.pushToast);
  const [runtimeMapsConfig, setRuntimeMapsConfig] = useState<RuntimeMapsConfig>({
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    googleMapsMapId: normalizeMapId(GOOGLE_MAPS_MAP_ID),
    enableMockMaps: FORCE_MOCK_MAP,
  });
  const [runtimeConfigChecked, setRuntimeConfigChecked] = useState(Boolean(GOOGLE_MAPS_API_KEY) || FORCE_MOCK_MAP);
  const useGoogleSdk = Boolean(runtimeMapsConfig.googleMapsApiKey) && !runtimeMapsConfig.enableMockMaps;

  useEffect(() => {
    if (!tripStore.tripId && itinerary.length === 0 && pins.length > 0) {
      clearPins();
    }
  }, [clearPins, itinerary.length, pins.length, tripStore.tripId]);
  const useAdvancedMarkers = Boolean(runtimeMapsConfig.googleMapsMapId);
  const [sdkState, setSdkState] = useState<SdkState>(() => (useGoogleSdk ? "loading" : "error"));
  const [mockZoom, setMockZoom] = useState(1);
  const [mapType, setMapType] = useState<GoogleMapTypeId>("roadmap");
  const [enabledLayers, setEnabledLayers] = useState<Record<MapOverlayLayer, boolean>>({
    traffic: false,
    transit: false,
    bicycling: false,
  });
  const [mapControlsOpen, setMapControlsOpen] = useState(false);
  const [providerError, setProviderError] = useState<string | null>(null);
  const mapElementRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<GoogleMapInstance | null>(null);
  const infoWindowRef = useRef<GoogleInfoWindowInstance | null>(null);
  const markersRef = useRef<Map<string, GoogleMarkerInstance>>(new Map());
  const polylinesRef = useRef<GooglePolylineInstance[]>([]);
  const routeLabelMarkersRef = useRef<GoogleMarkerInstance[]>([]);
  const overlayLayersRef = useRef<Record<MapOverlayLayer, GoogleMapLayerInstance | null>>({
    traffic: null,
    transit: null,
    bicycling: null,
  });
  const requestedPlaceDetailsRef = useRef<Set<string>>(new Set());

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
              ? normalizeMapId(payload.googleMapsMapId.trim())
              : "",
          enableMockMaps: payload.enableMockMaps === true,
        };
        setRuntimeMapsConfig(nextConfig);
        setRuntimeConfigChecked(true);
        setSdkState(nextConfig.googleMapsApiKey && !nextConfig.enableMockMaps ? "loading" : "error");
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
      loadGoogleMapsApi(runtimeMapsConfig.googleMapsApiKey)
        .then((maps) => {
          if (cancelled || !mapElementRef.current) {
            return;
          }
          const mapOptions: Record<string, unknown> = {
            center: DEFAULT_MAP_TW_CENTER,
            zoom: DEFAULT_MAP_TW_ZOOM,
            mapTypeId: "roadmap",
            streetViewControl: false,
            fullscreenControl: false,
            mapTypeControl: false,
          };
          if (useAdvancedMarkers) {
            mapOptions.mapId = runtimeMapsConfig.googleMapsMapId;
          }
          mapInstanceRef.current = new maps.Map(mapElementRef.current, mapOptions);
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
    if (!runtimeConfigChecked || !runtimeMapsConfig.googleMapsApiKey || pins.length === 0) {
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
          cachedPatches.set(entry.pinId, cached.details);
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
            patches.set(row.id, row.details);
            if (candidate) {
              writePlaceDetailsCache(candidate.key, { details: row.details });
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
  }, [itinerary, pins, runtimeConfigChecked, runtimeMapsConfig.googleMapsApiKey, tripDestination]);

  useEffect(() => {
    const maps = window.google?.maps;
    if (sdkState !== "ready" || !mapInstanceRef.current || !maps) {
      return;
    }
    const mapsApi = maps;

    let cancelled = false;
    let directionsTimer: number | NodeJS.Timeout | undefined;

    markersRef.current.forEach((marker) => marker.setMap(null));
    markersRef.current.clear();

    const map = mapInstanceRef.current;
    const clearRouteOverlays = () => {
      polylinesRef.current.forEach((polyline) => polyline.setMap(null));
      polylinesRef.current = [];
      routeLabelMarkersRef.current.forEach((marker) => marker.setMap(null));
      routeLabelMarkersRef.current = [];
    };

    if (pins.length === 0) {
      clearRouteOverlays();
      useMapStore.getState().setItinerarySegmentDurations({});
      map.setCenter(DEFAULT_MAP_TW_CENTER);
      map.setZoom(DEFAULT_MAP_TW_ZOOM);
      return;
    }

    const bounds = new mapsApi.LatLngBounds();

    function openInfoForSelectedPin() {
      if (!selectedPinId || !infoWindowRef.current) {
        return;
      }
      const pin = pins.find((entry) => entry.id === selectedPinId);
      if (!pin) {
        return;
      }
      const marker = markersRef.current.get(pin.id);
      if (!marker) {
        return;
      }
      const linkedItem = findLinkedItineraryItem(itinerary, pin);
      map.panTo({ lat: pin.lat, lng: pin.lng });
      infoWindowRef.current.setContent(buildPinInfoContent(pin, linkedItem));
      infoWindowRef.current.open({ map, anchor: marker });
    }

    function fitMapToBounds() {
      if (pins.length === 1) {
        map.setCenter({ lat: pins[0].lat, lng: pins[0].lng });
        map.setZoom(14);
      } else {
        map.fitBounds(bounds, 72);
      }
    }

    function scheduleDirectionsOverlay() {
      clearTimeout(directionsTimer);
      if (routeSegments.length === 0) {
        clearRouteOverlays();
        useMapStore.getState().setItinerarySegmentDurations({});
        logFrontendDebugEvent("map", "routes-empty", {
          pins: pins.length,
          itineraryDays: itinerary.length,
        });
        return;
      }
      logFrontendDebugEvent("map", "routes-scheduled", {
        segments: routeSegments.length,
        pins: pins.length,
      });
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
            const isHighlighted = highlightedRouteIds.has(segment.id);
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
            polylinesRef.current.push(polyline);
            path.forEach((p) => routeBounds.extend(p));

            const mid = path[Math.floor(path.length / 2)]!;
            const labelMarker = new mapsApi.Marker({
              map,
              position: mid,
              clickable: true,
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
            routeLabelMarkersRef.current.push(labelMarker);
          });

          useMapStore.getState().setItinerarySegmentDurations(nextMinutes);
          logFrontendDebugEvent("map", "routes-drawn", {
            requested: routeSegments.length,
            resolved: resolved.length,
            directions: resolved.filter((entry) => entry.usedDirections).length,
            fallback: resolved.filter((entry) => !entry.usedDirections).length,
            polylines: polylinesRef.current.length,
          });

          if (selectedPin) {
            map.panTo({ lat: selectedPin.lat, lng: selectedPin.lng });
            map.setZoom(Math.max(map.getZoom() || 12, 15));
            openInfoForSelectedPin();
          } else if (resolved.some((entry) => entry.usedDirections)) {
            map.fitBounds(routeBounds, 72);
          }
        })();
      }, 420);
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
            const selected = pin.id === selectedPinId;
            const stopN = pinStopById.get(pin.id);
            const content = createMapPinElement(pin.color || "#5a7ea3", selected, stopN);
            const marker = new lib.AdvancedMarkerElement({
              map,
              position: { lat: pin.lat, lng: pin.lng },
              title: pin.name,
              content,
            });
            // AdvancedMarkerElement emits `gmp-click` (not `click`) on its underlying element.
            marker.addListener("gmp-click", () => setSelectedPinId(pin.id));
            markersRef.current.set(pin.id, marker as GoogleMarkerInstance);
            bounds.extend({ lat: pin.lat, lng: pin.lng });
          });

          fitMapToBounds();
          openInfoForSelectedPin();
          scheduleDirectionsOverlay();
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
              icon: buildMarkerPinIcon(
                mapsApi,
                pin.color || "#5a7ea3",
                pin.id === selectedPinId,
                pinStopById.get(pin.id),
              ),
            });
            marker.addListener("click", () => setSelectedPinId(pin.id));
            markersRef.current.set(pin.id, marker);
            fallbackBounds.extend({ lat: pin.lat, lng: pin.lng });
          });
          if (pins.length === 1) {
            map.setCenter({ lat: pins[0].lat, lng: pins[0].lng });
            map.setZoom(14);
          } else {
            map.fitBounds(fallbackBounds, 72);
          }
          openInfoForSelectedPin();
          scheduleDirectionsOverlay();
        });
      return () => {
        cancelled = true;
        clearTimeout(directionsTimer);
      };
    }

    pins.forEach((pin) => {
      const marker = new mapsApi.Marker({
        map,
        position: { lat: pin.lat, lng: pin.lng },
        title: pin.name,
        icon: buildMarkerPinIcon(
          mapsApi,
          pin.color || "#5a7ea3",
          pin.id === selectedPinId,
          pinStopById.get(pin.id),
        ),
      });
      marker.addListener("click", () => setSelectedPinId(pin.id));
      markersRef.current.set(pin.id, marker);
      bounds.extend({ lat: pin.lat, lng: pin.lng });
    });

    fitMapToBounds();
    openInfoForSelectedPin();
    scheduleDirectionsOverlay();

    return () => {
      cancelled = true;
      clearTimeout(directionsTimer);
    };
  }, [
    itinerary,
    pinStopById,
    pins,
    pushToast,
    routeSegments,
    sdkState,
    selectedPinId,
    setSelectedPinId,
    tripDestination,
    useAdvancedMarkers,
    highlightedRouteIds,
    selectedPin,
  ]);

  useEffect(
    () => () => {
      markersRef.current.forEach((marker) => marker.setMap(null));
      markersRef.current.clear();
      polylinesRef.current.forEach((polyline) => polyline.setMap(null));
      polylinesRef.current = [];
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
  }

  function toggleOverlayLayer(layer: MapOverlayLayer) {
    setEnabledLayers((current) => ({
      ...current,
      [layer]: !current[layer],
    }));
  }

  const showRealMap = useGoogleSdk && sdkState !== "error";
  const mapReady = sdkState === "ready";

  return (
    <div
      data-testid="map-view"
      className="relative flex min-h-0 flex-1 w-full flex-col overflow-hidden rounded-2xl border-2 border-border bg-surface shadow-soft-lg ring-1 ring-black/5"
    >
      {showRealMap ? (
        <div className="relative z-0 min-h-0 flex-1">
          <div
            ref={mapElementRef}
            className="absolute inset-0 min-h-[200px] bg-[var(--surface-elevated)]"
          />
        </div>
      ) : (
        <div className="relative z-0 min-h-0 flex-1 overflow-hidden">
          <MockMapFallback
            pins={pins}
            pinStopById={pinStopById}
            routeSegments={routeSegments}
            highlightedRouteIds={highlightedRouteIds}
            selectedPinId={selectedPinId}
            setSelectedPinId={setSelectedPinId}
            zoom={mockZoom}
          />
        </div>
      )}

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

      <div className="absolute right-4 top-[7.25rem] z-[11] flex flex-col gap-2 sm:top-[6.75rem]">
        <button
          type="button"
          onClick={() => (showRealMap ? changeZoom(1) : changeMockZoom(0.18))}
          disabled={showRealMap && !mapReady}
          className="flex size-9 cursor-pointer items-center justify-center rounded-xl border border-border bg-surface text-muted shadow-soft transition-colors hover:border-primary/30 hover:bg-surface-elevated hover:text-foreground disabled:cursor-not-allowed disabled:opacity-45"
        >
          <ZoomIn className="size-4" />
        </button>
        <button
          type="button"
          onClick={() => (showRealMap ? changeZoom(-1) : changeMockZoom(-0.18))}
          disabled={showRealMap && !mapReady}
          className="flex size-9 cursor-pointer items-center justify-center rounded-xl border border-border bg-surface text-muted shadow-soft transition-colors hover:border-primary/30 hover:bg-surface-elevated hover:text-foreground disabled:cursor-not-allowed disabled:opacity-45"
        >
          <ZoomOut className="size-4" />
        </button>
        <button
          type="button"
          onClick={() => setMapControlsOpen((open) => !open)}
          aria-label={t.map.mapControls}
          aria-expanded={mapControlsOpen}
          disabled={showRealMap && !mapReady}
          className={cn(
            "flex size-9 cursor-pointer items-center justify-center rounded-xl border border-border bg-surface text-muted shadow-soft transition-colors hover:border-primary/30 hover:bg-surface-elevated hover:text-foreground disabled:cursor-not-allowed disabled:opacity-45",
            mapControlsOpen && "border-primary/35 bg-primary/10 text-primary",
          )}
        >
          <Layers className="size-4" />
        </button>
        <button
          type="button"
          onClick={focusSelectedPin}
          disabled={!mapReady || pins.length === 0}
          className="flex size-9 cursor-pointer items-center justify-center rounded-xl border border-border bg-surface text-muted shadow-soft transition-colors hover:border-primary/30 hover:bg-surface-elevated hover:text-foreground disabled:cursor-not-allowed disabled:opacity-45"
        >
          <Navigation className="size-4" />
        </button>
      </div>

      {mapControlsOpen && (
        <div className="absolute right-16 top-[7.25rem] z-[12] w-64 rounded-2xl border border-border-light bg-surface/95 p-3 text-xs shadow-soft-lg backdrop-blur-md sm:top-[6.75rem]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground">{t.map.mapControls}</p>
              <p className="mt-0.5 text-[11px] text-muted">{t.map.mapControlsHint}</p>
            </div>
            {!mapReady && showRealMap && (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary">
                {t.map.loadingLabel}
              </span>
            )}
          </div>

          <div className="mt-3">
            <p className="mb-2 font-semibold text-muted">{t.map.mapDisplayType}</p>
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
            <p className="mb-2 font-semibold text-muted">{t.map.mapOverlayLayers}</p>
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
