"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { AlertCircle, Layers, MapPin, Navigation, RefreshCcw, ZoomIn, ZoomOut } from "lucide-react";
import type {
  GoogleInfoWindowInstance,
  GoogleMapInstance,
  GoogleMapsApi,
  GoogleMarkerInstance,
} from "@/services/googleMapsLoader";
import {
  AIYO_MAPS_AUTH_FAILURE_EVENT,
  loadGoogleMapsApi,
} from "@/services/googleMapsLoader";
import { useMapStore } from "@/stores/useMapStore";
import { useToastStore } from "@/stores/useToastStore";
import { useTripStore } from "@/stores/useTripStore";
import type { MapPin as MapPinType } from "@/types";
import { zhTW as t } from "@/locales/zh-TW";

const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";
/** 與伺服端 ENABLE_MOCK_MAPS 對齊：建置時由 next.config 注入。 */
const FORCE_MOCK_MAP = process.env.NEXT_PUBLIC_ENABLE_MOCK_MAPS === "true";
/** Vector map ID from Cloud Console (Map Management). Required for AdvancedMarkerElement; omit to use legacy Marker. */
const GOOGLE_MAPS_MAP_ID = (process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || "").trim();
const useAdvancedMarkers = Boolean(GOOGLE_MAPS_MAP_ID);

/** 無任何標記時：地圖預設對準台灣本島（略放大、視覺置中）。 */
const DEFAULT_MAP_TW_CENTER = { lat: 23.62, lng: 121.0 };
const DEFAULT_MAP_TW_ZOOM = 8;

/** Mock 地圖無標記時的示意範圍（約略台灣區域）。 */
const MOCK_TW_LAT_RANGE = { min: 21.95, max: 25.35 };
const MOCK_TW_LNG_RANGE = { min: 119.35, max: 122.05 };

type SdkState = "loading" | "ready" | "error";

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

function MockMapFallback({
  pins,
  selectedPinId,
  setSelectedPinId,
  destination,
}: {
  pins: MapPinType[];
  selectedPinId: string | null;
  setSelectedPinId: (value: string | null) => void;
  destination: string;
}) {
  const [hoveredPin, setHoveredPin] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);

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
      x: ((lng - lngRange.min) / (lngRange.max - lngRange.min)) * 70 + 15,
      y: (1 - (lat - latRange.min) / (latRange.max - latRange.min)) * 70 + 15,
    };
  }

  return (
    <div className="relative h-full w-full bg-gradient-to-br from-primary/5 via-cream to-tertiary/5 map-grid">
      <div className="absolute right-4 top-4 z-10 flex flex-col gap-2">
        <button onClick={() => setZoom((value) => Math.min(value + 0.2, 2))} className="flex size-9 items-center justify-center rounded-xl bg-surface text-muted shadow-soft transition-colors hover:text-foreground">
          <ZoomIn className="size-4" />
        </button>
        <button onClick={() => setZoom((value) => Math.max(value - 0.2, 0.6))} className="flex size-9 items-center justify-center rounded-xl bg-surface text-muted shadow-soft transition-colors hover:text-foreground">
          <ZoomOut className="size-4" />
        </button>
      </div>

      <div className="absolute left-4 top-4 z-10 flex items-center gap-2 rounded-xl bg-surface/90 px-3 py-1.5 text-xs font-medium text-foreground shadow-soft backdrop-blur-sm">
        <MapPin className="size-3 text-secondary" />
        {destination}
        <span className="text-muted">
          - {pins.length} {t.map.pinsCount}
        </span>
      </div>

      <div className="relative h-full w-full transition-transform duration-300" style={{ transform: `scale(${zoom})`, transformOrigin: "center" }}>
        <svg className="pointer-events-none absolute inset-0 z-[1] h-full w-full">
          {pins.length > 1 &&
            pins.slice(0, -1).map((pin, index) => {
              const from = getPos(pin.lat, pin.lng);
              const to = getPos(pins[index + 1].lat, pins[index + 1].lng);
              return (
                <line
                  key={`route_${pin.id}`}
                  x1={`${from.x}%`}
                  y1={`${from.y}%`}
                  x2={`${to.x}%`}
                  y2={`${to.y}%`}
                  stroke="#7C9CBF"
                  strokeWidth="1.5"
                  strokeDasharray="6 4"
                  opacity="0.35"
                />
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
              className="absolute z-[2] -translate-x-1/2 -translate-y-full"
              style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
              onMouseEnter={() => setHoveredPin(pin.id)}
              onMouseLeave={() => setHoveredPin(null)}
              onClick={() => setSelectedPinId(pin.id)}
            >
              <div className="relative cursor-pointer group">
                <div className={`flex size-8 items-center justify-center rounded-full shadow-md transition-transform group-hover:scale-110 ${isSelected ? "ring-4 ring-primary/20" : ""}`} style={{ backgroundColor: pin.color || "#7C9CBF" }}>
                  <MapPin className="size-4 text-white" fill="white" />
                </div>
                {hoveredPin === pin.id && (
                  <div className="absolute bottom-full left-1/2 z-10 mb-2 -translate-x-1/2 whitespace-nowrap rounded-xl bg-surface px-3 py-2 text-left shadow-soft-lg">
                    <p className="text-xs font-semibold text-foreground">{pin.name}</p>
                    <p className="mt-0.5 text-[10px] text-muted">{pin.description}</p>
                  </div>
                )}
              </div>
            </motion.button>
          );
        })}

        {pins.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-muted">
            <div className="text-center">
              <MapPin className="mx-auto mb-2 size-8 opacity-30" />
              <p>{t.map.noPinsTitle}</p>
              <p className="mt-1 text-xs">{t.map.noPinsHint}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function MapView() {
  const destination = useTripStore((state) => state.destination);
  const itinerary = useTripStore((state) => state.itinerary);
  const { pins, selectedPinId, setSelectedPinId } = useMapStore();
  const pushToast = useToastStore((state) => state.pushToast);
  const useGoogleSdk = Boolean(GOOGLE_MAPS_API_KEY) && !FORCE_MOCK_MAP;
  const [sdkState, setSdkState] = useState<SdkState>(() => (useGoogleSdk ? "loading" : "error"));
  const [mapType, setMapType] = useState<"roadmap" | "satellite">("roadmap");
  const [providerError, setProviderError] = useState<string | null>(null);
  const mapElementRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<GoogleMapInstance | null>(null);
  const infoWindowRef = useRef<GoogleInfoWindowInstance | null>(null);
  const markersRef = useRef<Map<string, GoogleMarkerInstance>>(new Map());
  const notifiedFallbackRef = useRef(false);

  const selectedPin = useMemo(
    () => pins.find((pin) => pin.id === selectedPinId) || null,
    [pins, selectedPinId],
  );

  useEffect(() => {
    if (FORCE_MOCK_MAP) {
      if (!notifiedFallbackRef.current) {
        notifiedFallbackRef.current = true;
        pushToast({
          variant: "warning",
          title: t.map.mockDevTitle,
          description: t.map.mockDevDesc,
        });
      }
      queueMicrotask(() => setSdkState("error"));
      return;
    }

    if (!useGoogleSdk) {
      if (!notifiedFallbackRef.current) {
        notifiedFallbackRef.current = true;
        pushToast({
          variant: "info",
          title: t.map.keyMissingTitle,
          description: t.map.keyMissingDesc,
        });
      }
      return;
    }

    let cancelled = false;

    const timer = window.setTimeout(() => {
      if (!mapElementRef.current || cancelled) {
        return;
      }
      loadGoogleMapsApi(GOOGLE_MAPS_API_KEY)
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
            mapOptions.mapId = GOOGLE_MAPS_MAP_ID;
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
  }, [pushToast, useGoogleSdk]);

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
    const maps = window.google?.maps;
    if (sdkState !== "ready" || !mapInstanceRef.current || !maps) {
      return;
    }

    let cancelled = false;

    markersRef.current.forEach((marker) => marker.setMap(null));
    markersRef.current.clear();

    const map = mapInstanceRef.current;

    if (pins.length === 0) {
      map.setCenter(DEFAULT_MAP_TW_CENTER);
      map.setZoom(DEFAULT_MAP_TW_ZOOM);
      return;
    }

    const bounds = new maps.LatLngBounds();

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
      map.panTo({ lat: pin.lat, lng: pin.lng });
      infoWindowRef.current.setContent(`
      <div style="min-width:180px;padding:4px 2px;">
        <div style="font-weight:600;color:#1F2937;">${pin.name}</div>
        <div style="font-size:12px;color:#6B7280;margin-top:4px;">${pin.description}</div>
      </div>
    `);
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

    if (useAdvancedMarkers && typeof maps.importLibrary === "function") {
      void maps
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
              background: pin.color || "#7C9CBF",
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
          const fallbackBounds = new maps.LatLngBounds();
          pins.forEach((pin) => {
            const marker = new maps.Marker({
              map,
              position: { lat: pin.lat, lng: pin.lng },
              title: pin.name,
              icon: buildMarkerIcon(maps, pin.color || "#7C9CBF", pin.id === selectedPinId),
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
        });
      return () => {
        cancelled = true;
      };
    }

    pins.forEach((pin) => {
      const marker = new maps.Marker({
        map,
        position: { lat: pin.lat, lng: pin.lng },
        title: pin.name,
        icon: buildMarkerIcon(maps, pin.color || "#7C9CBF", pin.id === selectedPinId),
      });
      marker.addListener("click", () => setSelectedPinId(pin.id));
      markersRef.current.set(pin.id, marker);
      bounds.extend({ lat: pin.lat, lng: pin.lng });
    });

    fitMapToBounds();
    openInfoForSelectedPin();

    return () => {
      cancelled = true;
    };
  }, [pins, pushToast, sdkState, selectedPinId, setSelectedPinId]);

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

  const showRealMap = useGoogleSdk && sdkState !== "error";
  const mapReady = sdkState === "ready";

  return (
    <div className="relative h-full w-full overflow-hidden rounded-2xl bg-surface">
      {showRealMap ? (
        <div className="relative h-full w-full">
          <div ref={mapElementRef} className="h-full w-full min-h-[320px] bg-border-light/20" />
          {sdkState === "loading" && (
            <div className="absolute inset-0 z-[5] flex flex-col items-center justify-center gap-2 bg-surface/85 text-sm text-muted">
              <Navigation className="size-6 animate-pulse text-secondary" />
              <span>{t.map.loadingSdk}</span>
            </div>
          )}
        </div>
      ) : (
        <MockMapFallback pins={pins} selectedPinId={selectedPinId} setSelectedPinId={setSelectedPinId} destination={destination} />
      )}

      <div className="absolute left-4 top-4 z-10 flex items-center gap-2 rounded-xl bg-surface/90 px-3 py-1.5 text-xs font-medium text-foreground shadow-soft backdrop-blur-sm">
        <MapPin className="size-3 text-secondary" />
        {destination}
        <span className="text-muted">
          - {pins.length} {t.map.pinsCount}
        </span>
        <span className="rounded-full bg-border-light px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted">
          {mapReady ? t.map.googleMaps : showRealMap ? t.map.badgeLoadingSdk : t.map.fallbackMode}
        </span>
      </div>

      <div className="absolute right-4 top-4 z-10 flex flex-col gap-2">
        <button onClick={() => changeZoom(1)} disabled={!mapReady} className="flex size-9 items-center justify-center rounded-xl bg-surface text-muted shadow-soft transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50">
          <ZoomIn className="size-4" />
        </button>
        <button onClick={() => changeZoom(-1)} disabled={!mapReady} className="flex size-9 items-center justify-center rounded-xl bg-surface text-muted shadow-soft transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50">
          <ZoomOut className="size-4" />
        </button>
        <button onClick={toggleMapType} disabled={!mapReady} className="flex size-9 items-center justify-center rounded-xl bg-surface text-muted shadow-soft transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50">
          <Layers className="size-4" />
        </button>
        <button onClick={focusSelectedPin} disabled={!mapReady || pins.length === 0} className="flex size-9 items-center justify-center rounded-xl bg-surface text-muted shadow-soft transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50">
          <Navigation className="size-4" />
        </button>
      </div>

      {providerError && sdkState === "error" && (
        <div className="absolute left-4 bottom-4 z-10 flex w-80 items-start gap-3 rounded-2xl border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-foreground shadow-soft">
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-danger" />
          <div>
            <p className="font-semibold">{t.map.fallbackMode}</p>
            <p className="mt-1 text-xs text-muted">{providerError}</p>
          </div>
        </div>
      )}

      <div className="absolute bottom-4 left-4 z-10 w-72 rounded-2xl border border-border-light bg-surface/90 p-4 shadow-soft backdrop-blur-sm">
        <h3 className="mb-3 text-sm font-semibold text-foreground">{t.map.markerListTitle}</h3>
        <div className="flex max-h-44 flex-col gap-2 overflow-y-auto">
          {pins.map((pin) => (
            <button
              key={`list_${pin.id}`}
              onClick={() => setSelectedPinId(pin.id)}
              className={`rounded-xl border px-3 py-2 text-left transition-colors ${pin.id === selectedPinId ? "border-primary bg-primary/5" : "border-border-light hover:bg-cream/60"}`}
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
        <div className="absolute bottom-4 right-4 z-10 w-80 rounded-2xl border border-border-light bg-surface p-4 shadow-soft">
          <p className="mb-2 text-xs uppercase tracking-wide text-muted">{t.map.selectedPinTitle}</p>
          <h3 className="text-base font-semibold text-foreground">{selectedPin.name}</h3>
          <p className="mt-1 text-sm text-muted">{selectedPin.description}</p>
          <p className="mt-3 text-xs text-muted">{selectedPin.address || t.map.noAddress}</p>
          {highlightedItem && (
            <div className="mt-3 rounded-xl bg-primary/5 px-3 py-2">
              <p className="text-[11px] uppercase tracking-wide text-primary">{t.map.linkedItinerary}</p>
              <p className="mt-1 text-sm font-medium text-foreground">{highlightedItem.time} {highlightedItem.title}</p>
            </div>
          )}
        </div>
      )}

      {sdkState === "error" && GOOGLE_MAPS_API_KEY && !FORCE_MOCK_MAP && (
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
