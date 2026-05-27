"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import type { GoogleMapInstance, GoogleMapsApi, GoogleMarkerInstance } from "@/services/googleMapsLoader";
import { loadGoogleMapsApi } from "@/services/googleMapsLoader";
import { encodeMapPinDataUrl, MAP_PIN_VIEWBOX_H, MAP_PIN_VIEWBOX_W } from "@/components/map/mapPinIcon";
import type { MapPin as MapPinType } from "@/types";
import { zhTW as t } from "@/locales/zh-TW";

const GOOGLE_MAPS_API_KEY = (process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "").trim();
const FORCE_MOCK_MAP = process.env.NEXT_PUBLIC_ENABLE_MOCK_MAPS === "true";
const DEFAULT_CENTER = { lat: 23.62, lng: 121.0 };
const DEFAULT_ZOOM = 8;

type Props = {
  pins: MapPinType[];
  className?: string;
};

function buildMarkerIcon(maps: GoogleMapsApi, color: string) {
  const baseW = 34;
  const height = Math.round((MAP_PIN_VIEWBOX_H / MAP_PIN_VIEWBOX_W) * baseW);
  return {
    url: encodeMapPinDataUrl(color, false),
    scaledSize: new maps.Size(baseW, height),
    anchor: new maps.Point(baseW / 2, height),
  };
}

export default function PublicItineraryMap({ pins, className }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<GoogleMapInstance | null>(null);
  const markersRef = useRef<GoogleMarkerInstance[]>([]);
  const [sdkError, setSdkError] = useState(false);

  const validPins = useMemo(
    () => pins.filter((pin) => Number.isFinite(pin.lat) && Number.isFinite(pin.lng)),
    [pins],
  );

  useEffect(() => {
    if (FORCE_MOCK_MAP || !GOOGLE_MAPS_API_KEY || validPins.length === 0) {
      return;
    }

    let cancelled = false;

    void loadGoogleMapsApi(GOOGLE_MAPS_API_KEY)
      .then((maps) => {
        if (cancelled || !containerRef.current) {
          return;
        }

        if (!mapRef.current) {
          mapRef.current = new maps.Map(containerRef.current, {
            center: DEFAULT_CENTER,
            zoom: DEFAULT_ZOOM,
            disableDefaultUI: true,
            zoomControl: true,
            gestureHandling: "cooperative",
          });
        }

        markersRef.current.forEach((marker) => marker.setMap(null));
        markersRef.current = validPins.map((pin) => {
          const marker = new maps.Marker({
            map: mapRef.current!,
            position: { lat: pin.lat, lng: pin.lng },
            title: pin.name,
            icon: buildMarkerIcon(maps, pin.color || "#6366f1"),
          });
          return marker;
        });

        if (validPins.length === 1) {
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
  }, [validPins]);

  if (FORCE_MOCK_MAP || !GOOGLE_MAPS_API_KEY || sdkError || validPins.length === 0) {
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
