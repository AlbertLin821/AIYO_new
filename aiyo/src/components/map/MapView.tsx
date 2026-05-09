"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { AlertCircle, Layers, MapPin, Navigation, RefreshCcw, ZoomIn, ZoomOut } from "lucide-react";
import type {
  GoogleInfoWindowInstance,
  GoogleMapInstance,
  GoogleMapsApi,
  GoogleMarkerInstance,
  GooglePolylineInstance,
} from "@/services/googleMapsLoader";
import {
  AIYO_MAPS_AUTH_FAILURE_EVENT,
  loadGoogleMapsApi,
} from "@/services/googleMapsLoader";
import { fetchItineraryRoutePaths } from "@/lib/fetchItineraryDirections";
import { buildItineraryRouteSegments, type ItineraryRouteSegment } from "@/lib/routeSegments";
import { useMapStore } from "@/stores/useMapStore";
import { useToastStore } from "@/stores/useToastStore";
import { useTripStore } from "@/stores/useTripStore";
import type { MapPin as MapPinType } from "@/types";
import { zhTW as t } from "@/locales/zh-TW";

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

/** Mock 地圖無標記時的示意範圍（約略台灣區域）。 */
const MOCK_TW_LAT_RANGE = { min: 21.95, max: 25.35 };
const MOCK_TW_LNG_RANGE = { min: 119.35, max: 122.05 };

type SdkState = "loading" | "ready" | "error";

type RuntimeMapsConfig = {
  googleMapsApiKey: string;
  googleMapsMapId: string;
  enableMockMaps: boolean;
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

function buildMarkerIcon(maps: GoogleMapsApi, color: string, selected: boolean) {
  return {
    path: maps.SymbolPath.CIRCLE,
    scale: selected ? 10 : 8,
    fillColor: color,
    fillOpacity: 1,
    strokeColor: "#FFFFFF",
    strokeWeight: selected ? 3 : 2,
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

function buildRoutePlanningUrl(pin: Pick<MapPinType, "lat" | "lng" | "address" | "placeId">): string {
  const routeParams = new URLSearchParams({
    api: "1",
    destination: pin.address || `${pin.lat},${pin.lng}`,
  });
  if (pin.placeId) {
    routeParams.set("destination_place_id", pin.placeId);
  }
  return `https://www.google.com/maps/dir/?${routeParams.toString()}`;
}

function buildPinInfoContent(
  pin: MapPinType,
  linkedItem?: { time: string; title: string; type: string; transport?: string; notes?: string },
): string {
  const verifiedLabel = pin.verified ? t.map.verifiedBadge : t.map.unverifiedBadge;
  const confidence =
    typeof pin.confidence === "number" ? `${Math.round(pin.confidence * 100)}%` : t.common.notSet;
  const routeUrl = buildRoutePlanningUrl(pin);
  const thumbnail = pin.thumbnail || pin.photoUrl;
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
          <div style="width:12px;height:12px;border-radius:999px;background:${escapeHtml(pin.color || "#5a7ea3")};margin-top:5px;box-shadow:0 0 0 3px rgba(255,255,255,.9),0 2px 8px rgba(0,0,0,.18);"></div>
          <div style="min-width:0;flex:1;">
            <h3 style="margin:0;font-size:16px;line-height:1.35;font-weight:700;color:#111827;">${escapeHtml(pin.name)}</h3>
            <p style="margin:4px 0 0;font-size:12px;line-height:1.45;color:#4b5563;">${escapeHtml(pin.description || t.map.noDescription)}</p>
          </div>
        </div>
      </div>
      <dl style="display:grid;grid-template-columns:72px 1fr;gap:6px 8px;margin:12px 8px 0;font-size:12px;line-height:1.45;">
        <dt style="color:#6b7280;">${escapeHtml(t.map.infoAddress)}</dt>
        <dd style="margin:0;color:#1f2937;">${escapeHtml(pin.address || empty)}</dd>
        <dt style="color:#6b7280;">${escapeHtml(t.map.infoOpeningHours)}</dt>
        <dd style="margin:0;color:#1f2937;">${escapeHtml(pin.openingHours || empty)}</dd>
        <dt style="color:#6b7280;">${escapeHtml(t.map.infoPhone)}</dt>
        <dd style="margin:0;color:#1f2937;">${escapeHtml(pin.phoneNumber || empty)}</dd>
        <dt style="color:#6b7280;">${escapeHtml(t.map.infoSource)}</dt>
        <dd style="margin:0;color:#1f2937;">${escapeHtml(pinSourceLabel(pin.source))}${pin.dayNumber ? ` · D${escapeHtml(pin.dayNumber)}` : ""}</dd>
        <dt style="color:#6b7280;">${escapeHtml(t.map.infoStatus)}</dt>
        <dd style="margin:0;color:#1f2937;">${escapeHtml(verifiedLabel)} · ${escapeHtml(t.map.infoConfidence)} ${escapeHtml(confidence)}</dd>
        <dt style="color:#6b7280;">${escapeHtml(t.map.infoCoords)}</dt>
        <dd style="margin:0;color:#1f2937;">${escapeHtml(pin.lat.toFixed(5))}, ${escapeHtml(pin.lng.toFixed(5))}</dd>
      </dl>
      <a href="${escapeHtml(routeUrl)}" target="_blank" rel="noopener noreferrer" style="display:flex;align-items:center;justify-content:center;margin:12px 8px 0;padding:9px 12px;border-radius:10px;background:#426991;color:white;font-size:12px;font-weight:700;text-decoration:none;">
        ${escapeHtml(t.map.infoRoute)}
      </a>
      ${
        linkedItem
          ? `<div style="margin:12px 8px 0;padding:9px 10px;border-radius:12px;background:#f4f7fb;border:1px solid #dbe7f3;">
              <div style="font-size:11px;font-weight:700;color:#426991;letter-spacing:.04em;">${escapeHtml(t.map.linkedItinerary)}</div>
              <div style="margin-top:4px;font-size:13px;font-weight:650;color:#111827;">${escapeHtml(linkedItem.time)} ${escapeHtml(linkedItem.title)}</div>
              <div style="margin-top:3px;font-size:12px;color:#4b5563;">${escapeHtml(linkedItem.transport || t.common.notSet)}</div>
            </div>`
          : ""
      }
    </article>
  `;
}

function MockMapFallback({
  pins,
  routeSegments,
  selectedPinId,
  setSelectedPinId,
  zoom,
}: {
  pins: MapPinType[];
  routeSegments: ItineraryRouteSegment[];
  selectedPinId: string | null;
  setSelectedPinId: (value: string | null) => void;
  zoom: number;
}) {
  const [hoveredPin, setHoveredPin] = useState<string | null>(null);

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
                      strokeWidth="3"
                      strokeDasharray="8 6"
                      opacity="0.72"
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
                      {`${segment.transport} · ${formatRouteMinutes(segment.estimatedMinutes)}`}
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
                className="absolute z-[2] -translate-x-1/2 -translate-y-full outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-primary"
                style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
                onMouseEnter={() => setHoveredPin(pin.id)}
                onMouseLeave={() => setHoveredPin(null)}
                onClick={() => setSelectedPinId(pin.id)}
              >
                <div className="group relative cursor-pointer">
                  <div
                    className={`flex size-10 items-center justify-center rounded-full shadow-[0_4px_14px_rgba(0,0,0,0.2)] ring-2 ring-white transition-transform group-hover:scale-105 ${isSelected ? "ring-4 ring-secondary/70" : ""}`}
                    style={{ backgroundColor: pin.color || "#5a7ea3" }}
                  >
                    <MapPin className="size-[18px] text-white" fill="white" />
                  </div>
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
  const { pins, selectedPinId, setSelectedPinId } = useMapStore();
  const pushToast = useToastStore((state) => state.pushToast);
  const [runtimeMapsConfig, setRuntimeMapsConfig] = useState<RuntimeMapsConfig>({
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    googleMapsMapId: normalizeMapId(GOOGLE_MAPS_MAP_ID),
    enableMockMaps: FORCE_MOCK_MAP,
  });
  const [runtimeConfigChecked, setRuntimeConfigChecked] = useState(Boolean(GOOGLE_MAPS_API_KEY) || FORCE_MOCK_MAP);
  const useGoogleSdk = Boolean(runtimeMapsConfig.googleMapsApiKey) && !runtimeMapsConfig.enableMockMaps;
  const useAdvancedMarkers = Boolean(runtimeMapsConfig.googleMapsMapId);
  const [sdkState, setSdkState] = useState<SdkState>(() => (useGoogleSdk ? "loading" : "error"));
  const [mockZoom, setMockZoom] = useState(1);
  const [mapType, setMapType] = useState<"roadmap" | "satellite">("roadmap");
  const [providerError, setProviderError] = useState<string | null>(null);
  const mapElementRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<GoogleMapInstance | null>(null);
  const infoWindowRef = useRef<GoogleInfoWindowInstance | null>(null);
  const markersRef = useRef<Map<string, GoogleMarkerInstance>>(new Map());
  const polylinesRef = useRef<GooglePolylineInstance[]>([]);
  const routeLabelMarkersRef = useRef<GoogleMarkerInstance[]>([]);

  const selectedPin = useMemo(
    () => pins.find((pin) => pin.id === selectedPinId) || null,
    [pins, selectedPinId],
  );
  const routeSegments = useMemo(() => buildItineraryRouteSegments(itinerary), [itinerary]);
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
    const maps = window.google?.maps;
    if (sdkState !== "ready" || !mapInstanceRef.current || !maps) {
      return;
    }
    const mapsApi = maps;

    let cancelled = false;

    markersRef.current.forEach((marker) => marker.setMap(null));
    markersRef.current.clear();
    polylinesRef.current.forEach((polyline) => polyline.setMap(null));
    polylinesRef.current = [];
    routeLabelMarkersRef.current.forEach((marker) => marker.setMap(null));
    routeLabelMarkersRef.current = [];

    const map = mapInstanceRef.current;

    if (pins.length === 0) {
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
      const linkedItem = itinerary
        .flatMap((day) => day.items)
        .find((item) => item.id === pin.linkedTripItemId);
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
      if (routeSegments.length === 0) {
        return;
      }
      void (async () => {
        const resolved = await fetchItineraryRoutePaths(mapsApi, routeSegments, {
          cancelled: () => cancelled,
          region: "tw",
        });
        if (cancelled || !mapInstanceRef.current) {
          return;
        }
        const map = mapInstanceRef.current;
        const routeBounds = new mapsApi.LatLngBounds();
        pins.forEach((pin) => {
          routeBounds.extend({ lat: pin.lat, lng: pin.lng });
        });

        resolved.forEach(({ segment, path, usedDirections }) => {
          const polyline = new mapsApi.Polyline({
            map,
            path,
            strokeColor: segment.color,
            strokeOpacity: usedDirections ? 0.92 : 0.72,
            strokeWeight: usedDirections ? 5 : 4,
            geodesic: !usedDirections,
          });
          polylinesRef.current.push(polyline);
          path.forEach((p) => routeBounds.extend(p));

          const mid = path[Math.floor(path.length / 2)]!;
          const labelMarker = new mapsApi.Marker({
            map,
            position: mid,
            clickable: false,
            icon: {
              path: mapsApi.SymbolPath.CIRCLE,
              scale: 0,
              fillOpacity: 0,
              strokeOpacity: 0,
            },
            label: {
              text: `${segment.transport} · ${formatRouteMinutes(segment.estimatedMinutes)}`,
              color: segment.color,
              fontSize: "11px",
              fontWeight: "700",
            },
          });
          routeLabelMarkersRef.current.push(labelMarker);
        });

        if (resolved.some((entry) => entry.usedDirections)) {
          map.fitBounds(routeBounds, 72);
        }
      })();
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
            // Newer Maps JS SDK versions return PinElement as an HTMLElement directly;
            // older versions expose `.element`. Keep it compatible and avoid deprecation warnings.
            PinElement: new (options: Record<string, unknown>) => unknown;
          };

          pins.forEach((pin) => {
            const selected = pin.id === selectedPinId;
            const pinElement = new lib.PinElement({
              background: pin.color || "#5a7ea3",
              borderColor: "#FFFFFF",
              scale: selected ? 1.2 : 1,
            });
            // Avoid touching deprecated `.element` on newer SDKs (PinElement is already an HTMLElement there).
            const content =
              pinElement instanceof HTMLElement
                ? pinElement
                : (pinElement as { element: HTMLElement }).element;
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
              icon: buildMarkerIcon(mapsApi, pin.color || "#5a7ea3", pin.id === selectedPinId),
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
      };
    }

    pins.forEach((pin) => {
      const marker = new mapsApi.Marker({
        map,
        position: { lat: pin.lat, lng: pin.lng },
        title: pin.name,
        icon: buildMarkerIcon(mapsApi, pin.color || "#5a7ea3", pin.id === selectedPinId),
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
    };
  }, [itinerary, pins, pushToast, routeSegments, sdkState, selectedPinId, setSelectedPinId, useAdvancedMarkers]);

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

  function toggleMapType() {
    if (sdkState !== "ready" || !mapInstanceRef.current) {
      return;
    }
    const nextType = mapType === "roadmap" ? "satellite" : "roadmap";
    setMapType(nextType);
    mapInstanceRef.current.setMapTypeId(nextType);
  }

  const highlightedItem = itinerary
    .flatMap((day) => day.items)
    .find((item) => item.id === selectedPin?.linkedTripItemId);
  const selectedPinRoutes = selectedPin
    ? routeSegments.filter(
        (segment) =>
          segment.fromItemId === selectedPin.linkedTripItemId ||
          segment.toItemId === selectedPin.linkedTripItemId,
      )
    : [];

  const showRealMap = useGoogleSdk && sdkState !== "error";
  const mapReady = sdkState === "ready";

  return (
    <div className="relative flex min-h-0 flex-1 w-full flex-col overflow-hidden rounded-2xl border-2 border-border bg-surface shadow-soft-lg ring-1 ring-black/5">
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
            routeSegments={routeSegments}
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
          onClick={toggleMapType}
          disabled={!mapReady}
          className="flex size-9 cursor-pointer items-center justify-center rounded-xl border border-border bg-surface text-muted shadow-soft transition-colors hover:border-primary/30 hover:bg-surface-elevated hover:text-foreground disabled:cursor-not-allowed disabled:opacity-45"
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

      {providerError && sdkState === "error" && useGoogleSdk && (
        <div className="absolute left-4 bottom-4 z-[11] flex w-80 items-start gap-3 rounded-2xl border-2 border-danger/25 bg-peach-light/90 px-4 py-3 text-sm text-foreground shadow-soft-lg">
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-danger" />
          <div>
            <p className="font-semibold">{t.map.fallbackMode}</p>
            <p className="mt-1 text-xs text-muted">{providerError}</p>
          </div>
        </div>
      )}

      <div className="absolute bottom-4 left-4 z-[11] w-72 rounded-2xl border-2 border-border bg-surface/95 p-4 shadow-soft-lg backdrop-blur-sm" data-testid="map-marker-panel">
        <h3 className="mb-3 border-b border-border pb-2 text-sm font-semibold text-foreground">
          {t.map.markerListTitle}
        </h3>
        <div className="flex max-h-44 flex-col gap-2 overflow-y-auto pt-1" data-testid="map-marker-list">
          {pins.map((pin) => (
            <button
              key={`list_${pin.id}`}
              type="button"
              onClick={() => setSelectedPinId(pin.id)}
              data-testid="map-marker-item"
              className={`rounded-xl border px-3 py-2 text-left transition-colors ${pin.id === selectedPinId ? "border-secondary bg-secondary-light/50 ring-2 ring-secondary/35" : "border-border hover:bg-surface-elevated"}`}
            >
              <p className="text-sm font-medium text-foreground">{pin.name}</p>
              <p className="mt-0.5 text-xs text-muted">
                {pin.dayNumber ? `${t.map.dayPrefix}${pin.dayNumber}${t.map.daySuffix} - ` : ""}
                {pinSourceLabel(pin.source)}
              </p>
            </button>
          ))}
          {pins.length === 0 && <p className="text-xs text-muted">{t.map.listEmpty}</p>}
        </div>
      </div>

      {selectedPin && (
        <div className="absolute bottom-4 right-4 z-[11] max-h-[min(70vh,28rem)] w-80 overflow-y-auto rounded-2xl border-2 border-primary/25 bg-peach-light/60 p-4 shadow-soft-lg backdrop-blur-sm" data-testid="selected-map-pin">
          <div className="mb-3 flex h-28 items-center justify-center overflow-hidden rounded-xl bg-surface-elevated">
            {selectedPin.thumbnail || selectedPin.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- Google Places photo URLs are runtime-provided.
              <img
                src={selectedPin.thumbnail || selectedPin.photoUrl}
                alt={t.map.infoThumbnail}
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="text-xs font-medium text-muted">{t.map.infoThumbnail}</span>
            )}
          </div>
          <p className="mb-2 text-xs uppercase tracking-wide text-muted">{t.map.selectedPinTitle}</p>
          <h3 className="text-base font-semibold text-foreground">{selectedPin.name}</h3>
          <p className="mt-1 text-sm text-muted">{selectedPin.description}</p>
          <div className="mt-3 grid grid-cols-[4.5rem_1fr] gap-x-2 gap-y-1 text-xs">
            <span className="text-muted">{t.map.infoAddress}</span>
            <span className="text-foreground">{selectedPin.address || t.map.notProvided}</span>
            <span className="text-muted">{t.map.infoOpeningHours}</span>
            <span className="text-foreground">{selectedPin.openingHours || t.map.notProvided}</span>
            <span className="text-muted">{t.map.infoPhone}</span>
            <span className="text-foreground">{selectedPin.phoneNumber || t.map.notProvided}</span>
            <span className="text-muted">{t.map.infoSource}</span>
            <span className="text-foreground">
              {pinSourceLabel(selectedPin.source)}
              {selectedPin.dayNumber ? ` · D${selectedPin.dayNumber}` : ""}
            </span>
            <span className="text-muted">{t.map.infoStatus}</span>
            <span className="text-foreground">
              {selectedPin.verified ? t.map.verifiedBadge : t.map.unverifiedBadge}
              {typeof selectedPin.confidence === "number"
                ? ` · ${t.map.infoConfidence} ${Math.round(selectedPin.confidence * 100)}%`
                : ""}
            </span>
            <span className="text-muted">{t.map.infoCoords}</span>
            <span className="font-mono text-[11px] text-foreground">
              {selectedPin.lat.toFixed(5)}, {selectedPin.lng.toFixed(5)}
            </span>
          </div>
          <a
            href={buildRoutePlanningUrl(selectedPin)}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="map-route-link"
            className="mt-3 flex w-full items-center justify-center rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-primary-dark"
          >
            {t.map.infoRoute}
          </a>
          {highlightedItem && (
            <div className="mt-3 rounded-xl bg-primary/5 px-3 py-2">
              <p className="text-[11px] uppercase tracking-wide text-primary">{t.map.linkedItinerary}</p>
              <p className="mt-1 text-sm font-medium text-foreground">{highlightedItem.time} {highlightedItem.title}</p>
              {highlightedItem.transport && (
                <p className="mt-1 text-xs text-muted">{highlightedItem.transport}</p>
              )}
            </div>
          )}
          {selectedPinRoutes.length > 0 && (
            <div className="mt-3 rounded-xl border border-border/80 bg-surface/80 px-3 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                {t.map.relatedRoutes}
              </p>
              <div className="mt-2 flex flex-col gap-2">
                {selectedPinRoutes.map((segment) => (
                  <div key={segment.id} className="text-xs leading-relaxed text-foreground">
                    <p className="font-medium">
                      D{segment.dayNumber} {segment.fromTime} {segment.fromName} → {segment.toTime} {segment.toName}
                    </p>
                    <p className="text-muted">
                      {segment.transport} · {formatDistanceKm(segment.distanceKm)} · {formatRouteMinutes(segment.estimatedMinutes)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
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
