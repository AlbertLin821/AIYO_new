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
import { osmSourceUrl } from "@/lib/osmSourceUrl";
import MapPinInfoPanel from "@/components/map/MapPinInfoPanel";
import MapPoiAddSheet from "@/components/map/MapPoiAddSheet";
import { useMapStore, type MapPreviewPoi } from "@/stores/useMapStore";
import { useTripStore } from "@/stores/useTripStore";

const DEFAULT_STYLE =
  process.env.NEXT_PUBLIC_MAP_STYLE_URL ||
  "https://tiles.openfreemap.org/styles/liberty";
const CATEGORY_LABELS: Record<string, string> = { restaurant: "餐廳", cafe: "咖啡館", hotel: "住宿", attraction: "景點", museum: "博物館", park: "公園", convenience: "便利商店", parking: "停車場", station: "車站" };

function distanceLabel(from: { lat: number; lng: number }, to: { lat: number; lng: number }): string {
  const radians = Math.PI / 180;
  const latitude = (to.lat - from.lat) * radians;
  const longitude = (to.lng - from.lng) * radians;
  const arc = Math.sin(latitude / 2) ** 2 + Math.cos(from.lat * radians) * Math.cos(to.lat * radians) * Math.sin(longitude / 2) ** 2;
  const meters = 6371000 * 2 * Math.asin(Math.sqrt(arc));
  return meters < 1000 ? `約 ${Math.round(meters / 10) * 10} 公尺` : `約 ${(meters / 1000).toFixed(1)} 公里`;
}

function styleForDestination(destination: string): string {
  if (process.env.NEXT_PUBLIC_USE_LOCAL_MAP_STYLES !== "true") return DEFAULT_STYLE;
  const name = destination.toLowerCase();
  const matches = [
    [/台灣|臺灣|taiwan|台北|臺北|高雄|台中|臺中|嘉義|阿里山|花蓮|宜蘭|台南|臺南|新北|桃園/, "tw"],
    [/日本|japan|東京|大阪|京都|福岡|沖繩|北海道|名古屋|神戶|浅草|淺草/, "jp"],
    [/韓國|南韓|korea|首爾|서울|釜山|부산|濟州|제주/, "kr"],
  ] as const;
  const regions = matches.filter(([pattern]) => pattern.test(name));
  const region = regions.length === 1 ? regions[0][1] : null;
  return region ? `/local-map-styles/${region}.json` : DEFAULT_STYLE;
}

export default function MapLibreMapView({
  allowPoiAdd = false,
  readOnly = false,
}: {
  embedded?: boolean;
  allowPoiAdd?: boolean;
  readOnly?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const previewCloseRef = useRef<HTMLButtonElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const previewMarker = useRef<Marker | null>(null);
  const markers = useRef(new Map<string, Marker>());
  const fittedPins = useRef("");
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [routeFailed, setRouteFailed] = useState(false);
  const [nearbyLoading, setNearbyLoading] = useState(false);
  const [nearbyError, setNearbyError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchStatus, setSearchStatus] = useState<"idle" | "searching" | "empty" | "failed">("idle");
  const [searchResults, setSearchResults] = useState<MapPreviewPoi[]>([]);
  const [nearbyResults, setNearbyResults] = useState<typeof searchResults>([]);
  const [nearbyCenter, setNearbyCenter] = useState<{ lat: number; lng: number } | null>(null);
  const previewPoi = useMapStore((s) => s.previewPoi);
  const setPreviewPoi = useMapStore((s) => s.setPreviewPoi);
  useEffect(() => {
    if (previewPoi) previewCloseRef.current?.focus();
  }, [previewPoi]);
  useEffect(() => {
    previewMarker.current?.remove();
    previewMarker.current = null;
    if (!ready || !previewPoi || !mapRef.current) return;
    const marker = new maplibregl.Marker({ color: "#315f85" })
      .setLngLat([previewPoi.location.lng, previewPoi.location.lat])
      .addTo(mapRef.current);
    marker.getElement().dataset.testid = "map-preview-marker";
    marker.getElement().setAttribute("aria-label", `預覽地點：${previewPoi.name}`);
    previewMarker.current = marker;
    return () => {
      marker.remove();
      if (previewMarker.current === marker) previewMarker.current = null;
    };
  }, [ready, previewPoi]);
  const storedPins = useMapStore((s) => s.pins);
  const pins = useMemo(() => storedPins.filter(hasUsableMapCoordinate), [storedPins]);
  const focusLocation = useMapStore((s) => s.focusLocation);
  const selectedId = useMapStore((s) => s.selectedPinId);
  const setSelected = useMapStore((s) => s.setSelectedPinId);
  const setPending = useMapStore((s) => s.setPendingPoi);
  const visibleDays = useMapStore((s) => s.visibleRouteDayNumbers);
  const preferredDay = useMapStore((s) => s.preferredPoiDay);
  const setDurations = useMapStore((s) => s.setItinerarySegmentDurations);
  const itinerary = useTripStore((s) => s.itinerary);
  const tripId = useTripStore((s) => s.tripId);
  const destination = useTripStore((s) => s.destination);
  const styleUrl = styleForDestination(destination);
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
    const map = mapRef.current;
    const query = destination.trim();
    if (!map || !ready || !tripId || !query || pins.length || focusLocation || previewPoi) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 8000);
    let moved = false;
    const markMoved = () => { moved = true; };
    map.on("movestart", markMoved);
    void fetch(`/api/maps/search?q=${encodeURIComponent(query)}&limit=3`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return;
        const payload = await response.json();
        const match = payload.data?.results?.find((place: { location?: { lat: number; lng: number } }) =>
          place.location && hasUsableMapCoordinate(place.location));
        if (!match || moved || useTripStore.getState().tripId !== tripId || useMapStore.getState().pins.some(hasUsableMapCoordinate) || useMapStore.getState().focusLocation || useMapStore.getState().previewPoi) return;
        const isCountry = /^(?:台灣|臺灣|Taiwan|日本|Japan|韓國|南韓|Korea)$/i.test(query);
        map.easeTo({ center: [match.location.lng, match.location.lat], zoom: isCountry ? 6 : 11, duration: 500 });
      })
      .catch(() => {})
      .finally(() => { window.clearTimeout(timer); map.off("movestart", markMoved); });
    return () => { controller.abort(); window.clearTimeout(timer); map.off("movestart", markMoved); };
  }, [ready, tripId, destination, pins.length, focusLocation, previewPoi]);

  useEffect(() => {
    if (!host.current || mapRef.current) return;
    setReady(false);
    const markerMap = markers.current;
    maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
    const map = new maplibregl.Map({
      container: host.current,
      style: styleUrl,
      center: [121, 23.7],
      zoom: 6,
      attributionControl: false,
    });
    map.addControl(new maplibregl.NavigationControl(), "top-right");
    map.addControl(
      new maplibregl.AttributionControl({
        compact: true,
        customAttribution: styleUrl.startsWith("/local-map-styles/") ? undefined : "OpenFreeMap",
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
    const ro = new ResizeObserver(() => {
      map.resize();
      const currentPreview = useMapStore.getState().previewPoi;
      if (currentPreview) {
        map.jumpTo({ center: [currentPreview.location.lng, currentPreview.location.lat] });
      }
    });
    ro.observe(host.current);
    mapRef.current = map;
    return () => {
      markerMap.clear();
      ro.disconnect();
      markerMap.forEach((m) => m.remove());
      map.remove();
      mapRef.current = null;
    };
  }, [allowPoiAdd, readOnly, setPending, styleUrl]);

  useEffect(() => {
    if (!allowPoiAdd || readOnly || searchQuery.trim().length < 2) {
      setSearchResults([]);
      setSearchStatus("idle");
      return;
    }
    setSearchStatus("searching");
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void fetch(
        `/api/maps/search?q=${encodeURIComponent(searchQuery.trim())}&limit=6`,
        { signal: controller.signal },
      )
        .then(async (response) => {
          const payload = await response.json();
          if (!response.ok) throw new Error("search_failed");
          const results = payload.data?.results || [];
          setSearchResults(results);
          setSearchStatus(results.length ? "idle" : "empty");
        })
        .catch((error) => { if (error?.name !== "AbortError") setSearchStatus("failed"); });
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
      const syncRoute = () => {
        if (controller.signal.aborted || mapRef.current !== map || !map.isStyleLoaded()) return;
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
        map.off("styledata", syncRoute);
        map.off("idle", syncRoute);
      };
      map.on("styledata", syncRoute);
      map.on("idle", syncRoute);
      syncRoute();
      controller.signal.addEventListener("abort", () => {
        map.off("styledata", syncRoute);
        map.off("idle", syncRoute);
      }, { once: true });
    })();
    return () => controller.abort();
  }, [ready, segments, setDurations]);

  async function loadNearby() {
    const center = previewPoi
      ? previewPoi.location
      : selected
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
      const results = (payload.data?.results || []) as typeof searchResults;
      if (!results.length) setNearbyError("此範圍內未找到餐廳。");
      setNearbyCenter(center);
      setNearbyResults(results);
    } catch {
      setNearbyError("附近餐廳搜尋暫時無法使用，請稍後重試。");
    } finally {
      setNearbyLoading(false);
    }
  }

  function previewSearchResult(poi: MapPreviewPoi) {
    setPreviewPoi(poi);
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
        <div className="absolute left-3 right-3 top-3 z-10 space-y-2 md:right-auto md:w-72">
          <div className="flex gap-2">
            <input
              ref={searchInputRef}
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="搜尋景點或地址"
              aria-label="搜尋景點或地址"
              className="min-h-11 min-w-0 flex-1 rounded-lg border bg-white px-3 py-2 text-sm shadow focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            />
            <button
              type="button"
              onClick={() => void loadNearby()}
              disabled={nearbyLoading}
              className="min-h-11 rounded-lg bg-white px-3 py-2 text-sm font-medium shadow focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              {nearbyLoading ? "搜尋中…" : "附近餐廳"}
            </button>
          </div>
          {(searchResults.length > 0 || nearbyResults.length > 0) && (
            <div className="relative overflow-hidden rounded-lg bg-white shadow" role="region" aria-label={searchResults.length ? "地點搜尋結果" : "附近餐廳結果"}>
              <div className="border-b px-3 py-4 pr-14 text-xs font-medium text-slate-600">
                <span>{searchResults.length ? `地點搜尋結果 · ${searchResults.length} 處` : `附近餐廳 · ${nearbyResults.length} 處`}</span>
              </div>
              <ul className="max-h-[min(40vh,18rem)] overflow-y-auto overscroll-contain">
              {(searchResults.length > 0 ? searchResults : nearbyResults).map((poi) => (
                <li key={poi.id}>
                  <button
                    type="button"
                    onClick={() => { previewSearchResult(poi); setNearbyResults([]); }}
                    className="block min-h-11 w-full border-b px-3 py-2 text-left text-sm hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  >
                    <span className="block font-medium">{poi.name}</span>
                    {poi.address && (
                      <span className="block truncate text-xs text-slate-500">
                        {poi.address}
                      </span>
                    )}
                    {!searchResults.length && nearbyCenter && (
                      <span className="block text-xs text-slate-500">{distanceLabel(nearbyCenter, poi.location)} · OpenStreetMap</span>
                    )}
                  </button>
                </li>
              ))}
              </ul>
              <button type="button" onClick={() => { setSearchResults([]); setNearbyResults([]); searchInputRef.current?.focus(); }} aria-label="關閉地點結果" className="absolute right-0 top-0 min-h-11 min-w-11 rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">×</button>
            </div>
          )}
          {searchStatus === "searching" && <p role="status" className="rounded-lg bg-white px-3 py-2 text-xs shadow">搜尋中…</p>}
          {searchStatus === "empty" && <p role="status" className="rounded-lg bg-white px-3 py-2 text-xs shadow">找不到可確認的地點，請輸入更精確的名稱。</p>}
          {searchStatus === "failed" && <p role="alert" className="rounded-lg bg-white px-3 py-2 text-xs shadow">地點搜尋暫時失敗，請稍後重試。</p>}
        </div>
      )}
      {!readOnly && previewPoi && (
        <div role="region" aria-label="地點預覽" className="absolute bottom-4 left-4 z-20 w-[min(340px,calc(100vw-2rem))] rounded-2xl border border-border bg-white p-4 shadow-soft-lg">
          <div className="flex items-start justify-between gap-3">
            <div><h3 className="font-semibold">{previewPoi.name}</h3><p className="mt-1 text-xs text-muted">{previewPoi.address || "地址待確認"}</p></div>
            <button type="button" ref={previewCloseRef} onClick={() => { setPreviewPoi(null); searchInputRef.current?.focus(); }} aria-label="關閉地點預覽" className="min-h-11 min-w-11 rounded-lg border border-border focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">×</button>
          </div>
          <p className="mt-2 text-xs text-muted">來源：{previewPoi.source === "overpass" || previewPoi.id.startsWith("overpass:") ? "OpenStreetMap / Overpass" : "OpenStreetMap / Photon"} · {previewPoi.category ? CATEGORY_LABELS[previewPoi.category] || previewPoi.category : "類別待確認"} · 查核 {previewPoi.checkedAt?.slice(0, 10) || "待確認"} · 營業資訊待確認</p>
          {osmSourceUrl(previewPoi.id) && <a href={osmSourceUrl(previewPoi.id)!} target="_blank" rel="noopener noreferrer" className="mt-2 flex min-h-11 items-center text-xs font-semibold text-primary underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">查看 OpenStreetMap 來源</a>}
          <button type="button" onClick={() => { setPending({ placeId: previewPoi.id, lat: previewPoi.location.lat, lng: previewPoi.location.lng, name: previewPoi.name, address: previewPoi.address, resolvedFrom: previewPoi.source === "overpass" || previewPoi.id.startsWith("overpass:") ? "overpass" : "photon", checkedAt: previewPoi.checkedAt || new Date().toISOString(), category: previewPoi.category }); setPreviewPoi(null); }} className="mt-3 min-h-11 w-full rounded-xl bg-primary px-3 text-sm font-semibold text-white">加入行程</button>
        </div>
      )}
      {!readOnly && selected && !previewPoi && (
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
