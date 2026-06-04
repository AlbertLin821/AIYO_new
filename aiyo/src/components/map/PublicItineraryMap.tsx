"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import type { GoogleMapInstance, GoogleMapsApi, GoogleMarkerInstance } from "@/services/googleMapsLoader";
import {
  AIYO_MAPS_AUTH_FAILURE_EVENT,
  AIYO_MAPS_TARGET_BLOCKED_EVENT,
  getLoadedGoogleMapsApiKey,
  isGoogleMapsConsoleErrorMessage,
  loadGoogleMapsApi,
  unloadGoogleMapsApi,
} from "@/services/googleMapsLoader";
import { encodeMapPinDataUrl, MAP_PIN_VIEWBOX_H, MAP_PIN_VIEWBOX_W } from "@/components/map/mapPinIcon";
import type { MapPin as MapPinType } from "@/types";
import { normalizeGoogleMapsMapId } from "@/lib/googleMapsMapId";
import { zhTW as t } from "@/locales/zh-TW";

const GOOGLE_MAPS_API_KEY = (process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "").trim();
const FORCE_MOCK_MAP = process.env.NEXT_PUBLIC_ENABLE_MOCK_MAPS === "true";
const DEFAULT_CENTER = { lat: 23.62, lng: 121.0 };
const DEFAULT_ZOOM = 8;

type RuntimeMapsConfig = {
  googleMapsApiKey: string;
  googleMapsMapId: string;
  enableMockMaps: boolean;
};

function buildBuildTimeRuntimeMapsConfig(): RuntimeMapsConfig {
  return {
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    googleMapsMapId: "",
    enableMockMaps: FORCE_MOCK_MAP,
  };
}

type Props = {
  pins: MapPinType[];
  selectedPinId?: string | null;
  className?: string;
};

function buildMarkerIcon(maps: GoogleMapsApi, color: string, stopLabel: number, selected: boolean) {
  const baseW = 34;
  const height = Math.round((MAP_PIN_VIEWBOX_H / MAP_PIN_VIEWBOX_W) * baseW);
  return {
    url: encodeMapPinDataUrl(color, selected, stopLabel),
    scaledSize: new maps.Size(baseW, height),
    anchor: new maps.Point(baseW / 2, height),
  };
}

function createPublicMapPinElement(color: string, stopLabel: number, selected: boolean): HTMLDivElement {
  const wrapper = document.createElement("div");
  wrapper.className = "flex items-center justify-center";
  const marker = document.createElement("div");
  marker.className =
    "flex size-8 items-center justify-center rounded-full border-2 border-white text-[11px] font-bold text-white shadow-md";
  marker.style.backgroundColor = color;
  marker.style.transform = selected ? "scale(1.08)" : "scale(1)";
  marker.textContent = String(stopLabel);
  wrapper.appendChild(marker);
  return wrapper;
}

export default function PublicItineraryMap({ pins, selectedPinId, className }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<GoogleMapInstance | null>(null);
  const markersRef = useRef<GoogleMarkerInstance[]>([]);
  const [sdkError, setSdkError] = useState(false);
  const [runtimeConfigChecked, setRuntimeConfigChecked] = useState(FORCE_MOCK_MAP);
  const [runtimeMapsConfig, setRuntimeMapsConfig] = useState<RuntimeMapsConfig>({
    googleMapsApiKey: "",
    googleMapsMapId: "",
    enableMockMaps: FORCE_MOCK_MAP,
  });

  const validPins = useMemo(() => pins.filter((pin) => Number.isFinite(pin.lat) && Number.isFinite(pin.lng)), [pins]);

  const effectiveGoogleMapsApiKey = runtimeMapsConfig.googleMapsApiKey;
  const useGoogleSdk =
    runtimeConfigChecked &&
    !sdkError &&
    !runtimeMapsConfig.enableMockMaps &&
    !FORCE_MOCK_MAP &&
    Boolean(effectiveGoogleMapsApiKey);

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
        const loadedApiKey = getLoadedGoogleMapsApiKey();
        if (loadedApiKey && nextConfig.googleMapsApiKey && loadedApiKey !== nextConfig.googleMapsApiKey) {
          unloadGoogleMapsApi();
          mapRef.current = null;
        }
        setRuntimeMapsConfig(nextConfig);
        setRuntimeConfigChecked(true);
        setSdkError(nextConfig.enableMockMaps || !nextConfig.googleMapsApiKey);
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        const fallbackConfig = buildBuildTimeRuntimeMapsConfig();
        setRuntimeMapsConfig(fallbackConfig);
        setRuntimeConfigChecked(true);
        setSdkError(fallbackConfig.enableMockMaps || !fallbackConfig.googleMapsApiKey);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!useGoogleSdk) {
      return;
    }
    const onAuthFailure = () => {
      setSdkError(true);
    };
    const onTargetBlocked = () => {
      setSdkError(true);
    };
    const onWindowError = (event: ErrorEvent) => {
      if (!isGoogleMapsConsoleErrorMessage(event.message ?? "")) {
        return;
      }
      window.dispatchEvent(new CustomEvent(AIYO_MAPS_TARGET_BLOCKED_EVENT));
    };
    window.addEventListener(AIYO_MAPS_AUTH_FAILURE_EVENT, onAuthFailure);
    window.addEventListener(AIYO_MAPS_TARGET_BLOCKED_EVENT, onTargetBlocked);
    window.addEventListener("error", onWindowError);
    return () => {
      window.removeEventListener(AIYO_MAPS_AUTH_FAILURE_EVENT, onAuthFailure);
      window.removeEventListener(AIYO_MAPS_TARGET_BLOCKED_EVENT, onTargetBlocked);
      window.removeEventListener("error", onWindowError);
    };
  }, [useGoogleSdk]);

  useEffect(() => {
    if (!runtimeConfigChecked) {
      return;
    }
    if (!useGoogleSdk || validPins.length === 0) {
      return;
    }

    let cancelled = false;
    setSdkError(false);

    void loadGoogleMapsApi(effectiveGoogleMapsApiKey)
      .then(async (maps) => {
        if (cancelled || !containerRef.current) {
          return;
        }

        if (!mapRef.current) {
          const mapOptions: Record<string, unknown> = {
            center: DEFAULT_CENTER,
            zoom: DEFAULT_ZOOM,
            disableDefaultUI: true,
            zoomControl: true,
            gestureHandling: "greedy",
          };
          if (runtimeMapsConfig.googleMapsMapId) {
            mapOptions.mapId = runtimeMapsConfig.googleMapsMapId;
          }
          mapRef.current = new maps.Map(containerRef.current, mapOptions);
        }

        markersRef.current.forEach((marker) => marker.setMap(null));
        if (runtimeMapsConfig.googleMapsMapId && typeof maps.importLibrary === "function") {
          const markerLib = (await maps.importLibrary("marker")) as {
            AdvancedMarkerElement: new (options: Record<string, unknown>) => GoogleMarkerInstance;
          };
          markersRef.current = validPins.map((pin, index) => {
            const isSelected = selectedPinId != null && pin.id === selectedPinId;
            return new markerLib.AdvancedMarkerElement({
              map: mapRef.current!,
              position: { lat: pin.lat, lng: pin.lng },
              title: pin.name,
              content: createPublicMapPinElement(pin.color || "#6366f1", index + 1, isSelected),
            }) as GoogleMarkerInstance;
          });
        } else {
          markersRef.current = validPins.map((pin, index) => {
            const isSelected = selectedPinId != null && pin.id === selectedPinId;
            return new maps.Marker({
              map: mapRef.current!,
              position: { lat: pin.lat, lng: pin.lng },
              title: pin.name,
              icon: buildMarkerIcon(maps, pin.color || "#6366f1", index + 1, isSelected),
            });
          });
        }

        const selectedPin =
          selectedPinId != null ? validPins.find((pin) => pin.id === selectedPinId) ?? null : null;
        if (selectedPin) {
          mapRef.current!.panTo({ lat: selectedPin.lat, lng: selectedPin.lng });
        } else if (validPins.length === 1) {
          mapRef.current!.setCenter({ lat: validPins[0]!.lat, lng: validPins[0]!.lng });
          mapRef.current!.setZoom(13);
        } else if (validPins.length > 1) {
          const bounds = new maps.LatLngBounds();
          validPins.forEach((pin) => bounds.extend({ lat: pin.lat, lng: pin.lng }));
          mapRef.current!.fitBounds(bounds, 48);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSdkError(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [effectiveGoogleMapsApiKey, runtimeConfigChecked, runtimeMapsConfig.googleMapsMapId, selectedPinId, useGoogleSdk, validPins]);

  if (!useGoogleSdk || validPins.length === 0) {
    return (
      <div
        className={`rounded-2xl border border-border-light bg-cream/30 p-4 ${className ?? ""}`}
        data-testid="public-itinerary-map-fallback"
      >
        <p className="mb-3 text-sm font-medium text-foreground">{t.publicItinerary.mapTitle}</p>
        {validPins.length === 0 ? (
          <p className="text-sm text-muted">{t.publicItinerary.noMapPins}</p>
        ) : (
          <ul className="space-y-2">
            {validPins.map((pin) => (
              <li key={pin.id} className="flex items-start gap-2 text-sm text-muted">
                <MapPin className="mt-0.5 size-4 shrink-0 text-primary" />
                <span>
                  <span className="font-medium text-foreground">{pin.name}</span>
                  <span className="block text-xs">
                    {pin.lat.toFixed(4)}, {pin.lng.toFixed(4)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      data-testid="public-itinerary-map"
      className={`h-64 w-full overflow-hidden rounded-2xl border border-border-light ${className ?? ""}`}
    />
  );
}
