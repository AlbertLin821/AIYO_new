"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type {
  GeoJSONSource,
  Map as MapLibreMap,
  MapMouseEvent,
  Marker,
} from "maplibre-gl";
import { buildPinStopOrderByPinId } from "@/lib/mapPinItineraryLink";
import { loadMapRoute } from "@/lib/mapRoutePresentation";
import { buildItineraryRouteSegments, filterRouteSegmentsByDayNumbers } from "@/lib/routeSegments";
import { hasUsableMapCoordinate } from "@/lib/geoCoordinates";
import MapPinInfoPanel from "@/components/map/MapPinInfoPanel";
import MapPoiAddSheet from "@/components/map/MapPoiAddSheet";
import { useMapStore } from "@/stores/useMapStore";
import { useTripStore } from "@/stores/useTripStore";

const STYLE =
  process.env.NEXT_PUBLIC_MAP_STYLE_URL ||
  "https://tiles.openfreemap.org/styles/liberty";

export default function MapLibreMapView({
  allowPoiAdd = false,
  readOnly = false,
}: {
  embedded?: boolean;
  allowPoiAdd?: boolean;
  readOnly?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markers = useRef(new Map<string, Marker>());
  const fittedPins = useRef("");
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [routeFailed, setRouteFailed] = useState(false);
  const [nearbyLoading, setNearbyLoading] = useState(false);
  const [nearbyError, setNearbyError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<
    Array<{
      id: string;
      name: string;
      location: { lat: number; lng: number };
      address?: string;
    }>
  >([]);
  const storedPins = useMapStore((s) => s.pins);
  const pins = useMemo(() => storedPins.filter(hasUsableMapCoordinate), [storedPins]);
  const focusLocation = useMapStore((s) => s.focusLocation);
  const selectedId = useMapStore((s) => s.selectedPinId);
  const setSelected = useMapStore((s) => s.setSelectedPinId);
  const setPending = useMapStore((s) => s.setPendingPoi);
  const addPins = useMapStore((s) => s.addPins);
  const visibleDays = useMapStore((s) => s.visibleRouteDayNumbers);
  const preferredDay = useMapStore((s) => s.preferredPoiDay);
  const setDurations = useMapStore((s) => s.setItinerarySegmentDurations);
  const itinerary = useTripStore((s) => s.itinerary);
  const destination = useTripStore((s) => s.destination);
  const order = useMemo(
    () => buildPinStopOrderByPinId(itinerary, pins),
    [itinerary, pins],
  );
  const segments = useMemo(
    () => filterRouteSegmentsByDayNumbers(buildItineraryRouteSegments(itinerary), visibleDays),
    [itinerary, visibleDays],
  );
  const selected = pins.find((p) => p.id === selectedId);

  useEffect(() => {
    if (!ready || focusLocation?.lat == null || focusLocation.lng == null ||
      !hasUsableMapCoordinate({ lat: focusLocation.lat, lng: focusLocation.lng })) return;
    mapRef.current?.easeTo({
      center: [focusLocation.lng!, focusLocation.lat!],
      zoom: focusLocation.zoom || 15,
    });
  }, [ready, focusLocation]);

  useEffect(() => {
    if (!host.current || mapRef.current) return;
    const markerMap = markers.current;
    maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
    const map = new maplibregl.Map({
      container: host.current,
      style: STYLE,
      center: [121, 23.7],
      zoom: 6,
      attributionControl: false,
    });
    map.addControl(new maplibregl.NavigationControl(), "top-right");
    map.addControl(
      new maplibregl.AttributionControl({
        compact: true,
        customAttribution: "OpenFreeMap",
      }),
    );
    const markReady = () => {
      setFailed(false);
      setReady(true);
    };
    map.once("load", markReady);
    map.on("error", (event) => {
      console.warn("[map-render]", event.error?.message || "Map resource failed to load");
      if (!map.isStyleLoaded()) setFailed(true);
    });
    if (allowPoiAdd && !readOnly)
      map.on("click", (e: MapMouseEvent) =>
        setPending({ lat: e.lngLat.lat, lng: e.lngLat.lng }),
      );
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(host.current);
    mapRef.current = map;
    return () => {
      markerMap.clear();
      ro.disconnect();
      markerMap.forEach((m) => m.remove());
      map.remove();
      mapRef.current = null;
    };
  }, [allowPoiAdd, readOnly, setPending]);

  useEffect(() => {
    if (!allowPoiAdd || readOnly || searchQuery.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void fetch(
        `/api/maps/search?q=${encodeURIComponent(searchQuery.trim())}&limit=6`,
        { signal: controller.signal },
      )
        .then(async (response) => {
          const payload = await response.json();
          if (response.ok) setSearchResults(payload.data?.results || []);
        })
        .catch(() => undefined);
    }, 300);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [allowPoiAdd, readOnly, searchQuery]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const ids = new Set(pins.map((p) => p.id));
    markers.current.forEach((m, id) => {
      if (!ids.has(id)) {
        m.remove();
        markers.current.delete(id);
      }
    });
    pins.forEach((pin) => {
      const n = order.get(pin.id);
      let marker = markers.current.get(pin.id);
      if (!marker) {
        const el = document.createElement("button");
        el.type = "button";
        el.dataset.testid = "map-pin-marker";
        el.className = "aiyo-maplibre-marker";
        el.onclick = (event) => {
          event.stopPropagation();
          const nextId = useMapStore.getState().selectedPinId === pin.id ? null : pin.id;
          setSelected(nextId);
          if (!nextId) return;
          map.easeTo({
            center: marker!.getLngLat(),
            zoom: Math.max(14, map.getZoom()),
          });
        };
        const created = new maplibregl.Marker({ element: el, anchor: "bottom" })
          .setLngLat([pin.lng, pin.lat])
          .addTo(map);
        markers.current.set(pin.id, created);
        marker = created;
      }
      const el = marker.getElement();
      el.textContent = n ? String(n) : "•";
      el.setAttribute(
        "aria-label",
        `${n ? `第 ${n} 站：` : "地點："}${pin.name}`,
      );
      el.style.setProperty("--pin-color", pin.color || "#5a7ea3");
      el.toggleAttribute("data-selected", pin.id === selectedId);
      marker.setLngLat([pin.lng, pin.lat]);
    });
    const boundsKey = pins.map((p) => `${p.id}:${p.lat}:${p.lng}`).join("|");
    if (pins.length && fittedPins.current !== boundsKey) {
      fittedPins.current = boundsKey;
      const b = new maplibregl.LngLatBounds();
      pins.forEach((p) => b.extend([p.lng, p.lat]));
      map.fitBounds(b, { padding: 64, maxZoom: 15 });
    }
  }, [order, pins, ready, selectedId, setSelected]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !selected) return;
    map.easeTo({ center: [selected.lng, selected.lat], zoom: Math.max(14, map.getZoom()) });
  }, [ready, selected]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const controller = new AbortController();
    setRouteFailed(false);
    setDurations({});
    (map.getSource("routes") as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: [] });
    void (async () => {
      const features: Awaited<ReturnType<typeof loadMapRoute>>["feature"][] = [];
      const durations: Record<string, number> = {};
      // Small batches keep long itineraries responsive without flooding the provider.
      for (let offset = 0; offset < segments.length; offset += 4) {
        const batch = segments.slice(offset, offset + 4);
        const results = await Promise.allSettled(batch.map((segment) => loadMapRoute(segment, controller.signal)));
        if (controller.signal.aborted) return;
        results.forEach((result, index) => {
          if (result.status !== "fulfilled") return;
          features.push(result.value.feature);
          if (result.value.minutes !== undefined) durations[batch[index].id] = result.value.minutes;
        });
      }
      if (controller.signal.aborted) return;
      setRouteFailed(features.some((feature) => feature.properties.schematic));
      setDurations(durations);
      const data: GeoJSON.FeatureCollection<GeoJSON.LineString> = { type: "FeatureCollection", features };
      const source = map.getSource("routes") as GeoJSONSource | undefined;
      if (source) source.setData(data);
      else {
        map.addSource("routes", { type: "geojson", data });
        map.addLayer({
          id: "routes-line", type: "line", source: "routes",
          filter: ["==", ["get", "schematic"], false],
          paint: { "line-color": ["get", "color"], "line-width": 5, "line-opacity": 0.82 },
        });
        map.addLayer({
          id: "routes-schematic", type: "line", source: "routes",
          filter: ["==", ["get", "schematic"], true],
          paint: { "line-color": ["get", "color"], "line-width": 3, "line-dasharray": [2, 2], "line-opacity": 0.65 },
        });
      }
    })();
    return () => controller.abort();
  }, [ready, segments, setDurations]);

  async function loadNearby() {
    const center = selected
      ? { lat: selected.lat, lng: selected.lng }
      : mapRef.current
        ? {
            lat: mapRef.current.getCenter().lat,
            lng: mapRef.current.getCenter().lng,
          }
        : null;
    if (!center) return;
    setNearbyLoading(true);
    setNearbyError(null);
    try {
      const response = await fetch(
        `/api/maps/nearby?lat=${center.lat}&lng=${center.lng}&radius=1500&category=restaurant&limit=12`,
      );
      const payload = await response.json();
      if (!response.ok) throw new Error("附近餐廳搜尋暫時無法使用，請稍後重試。");
      if (!payload.data?.results?.length) setNearbyError("此範圍內未找到餐廳。");
      if (response.ok)
        addPins(
          (payload.data?.results || []).map(
            (poi: {
              id: string;
              name: string;
              location: { lat: number; lng: number };
              address?: string;
            }) => ({
              id: poi.id,
              name: poi.name,
              lat: poi.location.lat,
              lng: poi.location.lng,
              description: poi.address || poi.name,
              address: poi.address,
              source: "manual" as const,
            }),
          ),
        );
    } catch {
      setNearbyError("附近餐廳搜尋暫時無法使用，請稍後重試。");
    } finally {
      setNearbyLoading(false);
    }
  }

  function addSearchResult(poi: {
    id: string;
    name: string;
    location: { lat: number; lng: number };
    address?: string;
  }) {
    addPins([
      {
        id: poi.id,
        name: poi.name,
        lat: poi.location.lat,
        lng: poi.location.lng,
        description: poi.address || poi.name,
        address: poi.address,
        source: "manual" as const,
      },
    ]);
    setSelected(poi.id);
    setSearchQuery("");
    setSearchResults([]);
    mapRef.current?.easeTo({
      center: [poi.location.lng, poi.location.lat],
      zoom: 15,
    });
  }

  return (
    <div
      className="relative size-full min-h-80 overflow-hidden bg-slate-100"
      data-testid="map-view"
    >
      {/* MapLibre's unlayered position:relative overrides Tailwind utilities. */}
      <div ref={host} style={{ position: "absolute", inset: 0 }} aria-label="行程地圖" data-testid="maplibre-map" />
      {!ready && !failed && (
        <div className="absolute inset-0 grid place-items-center">
          載入開放地圖中…
        </div>
      )}
      {failed && (
        <div className="absolute inset-0 grid place-items-center bg-slate-100">
          地圖載入失敗，行程仍可使用。
        </div>
      )}
      {routeFailed && (
        <div className="absolute bottom-8 left-3 rounded bg-amber-50 px-3 py-2 text-xs">
          虛線為地點連接示意：大眾運輸或未取得導航路線的路段，請另確認實際班次與動線。
        </div>
      )}
      {nearbyError && <p role="status" className="absolute bottom-16 left-3 z-10 rounded bg-white px-3 py-2 text-sm">{nearbyError}</p>}
      {allowPoiAdd && !readOnly && ready && (
        <div className="absolute left-3 top-3 z-10 w-72 space-y-2">
          <div className="flex gap-2">
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="搜尋景點或地址"
              aria-label="搜尋景點或地址"
              className="min-w-0 flex-1 rounded-lg border bg-white px-3 py-2 text-sm shadow"
            />
            <button
              type="button"
              onClick={() => void loadNearby()}
              disabled={nearbyLoading}
              className="rounded-lg bg-white px-3 py-2 text-sm font-medium shadow"
            >
              {nearbyLoading ? "搜尋中…" : "附近餐廳"}
            </button>
          </div>
          {searchResults.length > 0 && (
            <ul className="overflow-hidden rounded-lg bg-white shadow">
              {searchResults.map((poi) => (
                <li key={poi.id}>
                  <button
                    type="button"
                    onClick={() => addSearchResult(poi)}
                    className="block w-full border-b px-3 py-2 text-left text-sm hover:bg-slate-50"
                  >
                    <span className="block font-medium">{poi.name}</span>
                    {poi.address && (
                      <span className="block truncate text-xs text-slate-500">
                        {poi.address}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {!readOnly && selected && (
        <MapPinInfoPanel
          pin={selected}
          onClose={() => setSelected(null)}
          className="absolute bottom-4 left-4 z-10 max-w-sm"
        />
      )}
      {allowPoiAdd && !readOnly && (
        <MapPoiAddSheet tripDestination={destination} defaultDayNumber={preferredDay} />
      )}
    </div>
  );
}
