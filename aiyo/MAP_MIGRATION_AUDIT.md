# AIYO Map System Migration Audit

Date: 2026-09-07  
Scope: Phase 0 repository audit and migration design only  
Target stack: MapLibre GL JS + OpenFreeMap + OpenStreetMap + Photon + Overpass API + OSRM

## 1. Executive summary

AIYO does not use a packaged Google React map library. It owns a custom JavaScript loader and a large imperative renderer. The migration therefore does not require removing `@react-google-maps/api`, but it does require replacing four distinct Google responsibilities:

1. Browser rendering: map lifecycle, markers, popups, bounds, overlays and route polylines.
2. Location intelligence: forward/reverse geocoding, text suggestions, details and photos.
3. Routing intelligence: browser route geometry plus server-side travel duration/distance enrichment.
4. Configuration and legacy metadata: API keys, map IDs, `placeId`, Google URLs, photos, ratings and persisted records.

The existing domain foundation is favorable: itinerary and map state are serializable, coordinates are already normalized to `{ lat, lng }`, pins are derived from itinerary state, selection is stored as `selectedPinId`, and reorder operations rebuild the itinerary-to-pin relationship. The safest approach is to preserve those contracts, introduce provider-independent location-service contracts behind AIYO API routes, then replace the renderer.

No production code was changed during this audit.

## 2. Repository and dependency baseline

- Application: Next.js 16.3.4 App Router, React 19, Zustand 5, Prisma 6.
- Map package status: no `@googlemaps/*`, `@react-google-maps/api`, `google-map-react` or MapLibre dependency is installed.
- Google JavaScript is loaded dynamically by `src/services/googleMapsLoader.ts`.
- Existing relevant checks: `npm run lint`, `npm test`, `npm run build`, Playwright `map.spec.ts`, `map-marker-info-card.spec.ts`, `itinerary-editor-flow.spec.ts`, `full-user-travel-flow.spec.ts`, and `video-summary-map-quality.spec.ts`.
- Working tree already contains user and prior approved platform-hardening changes. They must be preserved throughout the migration.

Repository reference counts excluding `node_modules`, `.next`, preloaded JSON and the lockfile:

| Reference | Files |
|---|---:|
| `google.maps` | 3 |
| `maps.googleapis.com` | 7 |
| `routes.googleapis.com` | 1 |
| `GOOGLE_MAPS_API_KEY` | 34 |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | 11 |
| `googleMapsUrl` | 26 |
| `placeId` | 71 |
| `google-place` | 8 |
| `google_routes` | 6 |
| `googleMapsLoader` | 6 |

`placeId` is not automatically removable: it is persisted throughout historical and preloaded data and must become legacy/provider metadata before Google logic can be deleted.

## 3. Google Maps usage inventory

### 3.1 Core browser rendering

| File / symbol | Google API or coupling | Input → output | Core | Difficulty |
|---|---|---|---|---|
| `src/components/map/MapView.tsx` / `MapView` | `Map`, `Marker`, `AdvancedMarkerElement`, `InfoWindow`, `Polyline`, `LatLngBounds`, traffic/transit/bicycling layers, map events, `panTo`, `fitBounds`, `setMapTypeId` | Zustand pins, itinerary, route segments, preferences → interactive map | Critical | Very high |
| `src/services/googleMapsLoader.ts` | script injection, `importLibrary`, Google instance interfaces, auth/error events | client key → Google namespace facade | Critical | High; delete only after renderer replacement |
| `src/components/map/PublicItineraryMap.tsx` | Map, advanced/legacy markers, bounds and pan | public pins + selected ID → read-only preview | High | Medium |
| `src/components/map/MapPoiAddOverlay.tsx` | `OverlayView`, panes, projection and Google listener handles | clicked/pending POI → anchored add overlay | High | High; replace with MapLibre popup/DOM overlay |
| `src/lib/fetchItineraryDirections.ts` | Routes library `computeRoutes`, Google travel modes | ordered segments → route paths/durations | Critical | High; replace with backend OSRM route API |
| `src/lib/mapPreferences.ts` | Google map type union | persisted map type/labels/layers → renderer settings | Medium | Medium; schema migration required |
| `src/lib/mapLabelStyles.ts` | Google style-rule schema | label toggles → Google styles | Medium | Medium; map to MapLibre style layer visibility |
| `src/lib/googleMapsMapId.ts`, `src/lib/googleMapsEnv.ts` | key/map-id config | env → runtime/build configuration | High | Low after consumers removed |

`MapPinMarker.tsx`, `mapPinIcon.ts`, `MapPinInfoPanel.tsx` and `mapPinInfoShared.ts` contain reusable UI/domain presentation. They should be adapted, not discarded.

### 3.2 Server geocoding, search and details

| File / symbol | Current provider | Input → output | Core | Difficulty |
|---|---|---|---|---|
| `src/server/geo/geocodeService.ts` | Google Geocoding + Place Details | text/place ID/coordinate → normalized location and confidence evidence | Critical | Very high; contains mature quality gates |
| `src/server/geo/placesSearchService.ts` | Google Places text search | query + location hint → `PlaceSearchHit[]` | Critical | High |
| `src/server/places/geocodePlace.ts` | Google geocode plus internal catalog fallback | scoped query → ranked/verified candidate | Critical | Very high; preserve destination-scope scoring |
| `src/server/services/repairTripHydration.ts` | Google place details | incomplete persisted item → enriched legacy metadata | High | High; must accept legacy records without requiring Google |
| `src/server/video/placeExtraction/placeVerifier.ts` and video geo pipeline | Google-backed verification | transcript mentions → verified map-ready locations | High | High |
| `src/app/api/map/geocode/route.ts` | direct Google service call | authenticated POST → `GeocodeApiResult` | Critical | Medium; retain alias during transition |
| `src/app/api/map/reverse-geocode/route.ts` | direct Google service call | authenticated coordinate → location | High | Medium |
| `src/app/api/map/place-details/route.ts` | Google details/text search | place ID/name → detail patch | High | High; OSM lacks equivalent rating/photo coverage |
| `src/app/api/places/suggest/route.ts` | indirect Google geocoder | authenticated query → suggestions | Critical | Medium; frontend-compatible alias candidate |
| `src/app/api/places/geocode/route.ts` | indirect Google geocoder | trip-scoped query → geocoded place | Critical | Medium |
| `src/app/api/map/place-photo/route.ts` | Google Place Photo proxy | photo reference → bounded image response | Medium/legacy | Medium; retain only for old data during transition |
| `src/app/api/map/setup-check/route.ts` | Google setup diagnostics | env/provider status → diagnostic | Low | Low; replace with provider health summary |

### 3.3 Routing and travel-time enrichment

| File / symbol | Coupling | Behavior | Migration |
|---|---|---|---|
| `src/server/geo/routeTravelTimeService.ts` | Google Routes REST, `google_routes` source | enriches consecutive itinerary items with minutes/meters | Replace with provider-neutral routing service backed by OSRM |
| `src/lib/fetchItineraryDirections.ts` | Google browser Routes library | fetches each segment geometry and falls back to a straight line | Move all network work behind `/api/maps/route`; retain straight-line fallback |
| `src/lib/routeSegments.ts` | optional Google place IDs in segment | builds ordered segments from itinerary | Keep coordinate ordering; rename provider-specific fields later |
| `src/lib/googleDirectionsTravelMode.ts` | Google mode enum mapping | transport label → Google travel mode | Replace with normalized `MapTravelProfile` mapping |
| `src/stores/useMapStore.ts` | field/comment `segmentDirectionsMinutes` | stores route-derived per-segment minutes | Rename compatibly to provider-neutral route durations |

Important limitation: the public OSRM demo normally exposes a driving profile. AIYO transport labels include transit and cycling. Unsupported modes must not be misrepresented as OSRM transit; the migration should use configured supported profiles and fall back to estimates/straight lines where unavailable.

### 3.4 Configuration, deployment and documentation

| Location | Google dependency |
|---|---|
| `.env.example`, `.env.dev.example`, `.env.prod-live.example` | server/client map keys and map ID |
| `next.config.ts` | injects client key and map ID into build output |
| `Dockerfile` | accepts and exports `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` |
| `src/app/api/runtime-config/route.ts` | returns browser key/map ID |
| `src/server/config.ts` | exposes server Google key |
| `README.md`, testing/migration documentation and scripts | setup and quality assumptions |
| preloaded destination JSON, fixtures and Prisma records | historical Google Place IDs and details |

## 4. Current map/domain data model

### 4.1 `LocationReference`

Canonical coordinate shape is already `lat: number`, `lng: number`. It also mixes domain data with Google metadata:

- Provider-neutral/reusable: `name`, `lat`, `lng`, `description`, `address`, `photoUrl`, `thumbnail`, `openingHours`, `phoneNumber`, `website`, confidence and verification evidence.
- Google-specific: `placeId`, `googleMapsUrl`, rating/count origin, `resolvedFrom: google-geocode | google-place-details`, `verifiedPlaceIds`.
- Risk: comments and verification semantics currently equate “verified” with Google. These must become provider-neutral without weakening destination-scope checks.

### 4.2 `MapPin`

`MapPin` duplicates location presentation fields and adds stable UI relationships:

- `id`, `linkedTripItemId`, `dayNumber`, `source`, `color`
- selected state lives separately in `useMapStore.selectedPinId`
- marker number is derived from current itinerary order by `buildPinStopOrderByPinId`, not persisted

This is the correct basis for MapLibre. MapLibre `Map`, `Marker`, `Popup` and source instances must remain in component refs, never in Zustand.

### 4.3 Persistence

Prisma persists `placeId` and `googleMapsUrl` on itinerary items and pins. Existing records and preloaded data contain many real Google IDs. They should be retained as optional legacy metadata and never used as the primary identity after migration.

Recommended additive model, initially at TypeScript/API level:

```ts
type GeoPoint = { lat: number; lng: number };

type LocationProvider = "osm" | "photon" | "overpass" | "user" | "legacy-google";

type MapPoi = {
  id: string;                 // provider-qualified stable ID
  name: string;
  location: GeoPoint;
  address?: string;
  category?: MapPoiCategory;
  source: LocationProvider;
  externalId?: string;        // OSM n/w/r ID or provider ID
  legacyGooglePlaceId?: string;
  metadata?: {
    phone?: string;
    website?: string;
    openingHours?: string;
    cuisine?: string;
  };
};
```

Do not add this as a second permanent location model. The implementation phase must choose one canonical model and provide boundary adapters for `LocationReference`/`MapPin` during rollout.

## 5. Current data flows

### 5.1 Itinerary to map

```text
Trip API/bootstrap/realtime
  → useTripStore.itinerary
  → mapSync.reconcileTripMapState / buildPinsFromTripPlan
  → useMapStore.pins
  → MapView.visiblePins
  → marker instances + fitBounds + route segments
```

Reorder is already event-driven:

```text
ItineraryPanel drag end OR AssistantAction itinerary.reorder_items
  → useTripStore reorder/move
  → reconcileTripMapState
  → linked pin IDs retained
  → buildPinStopOrderByPinId reads new item order
  → marker labels and route segment order recompute
```

### 5.2 Selection synchronization

```text
Itinerary row click
  → setSelectedPinId(linkedPin.id)
  → MapView panTo/highlight/open info

Marker click
  → MapView.handlePinMarkerClick
  → setSelectedPinId(pin.id)
  → ItineraryPanel derives isSelected
```

The current scan confirms selection highlighting. A guaranteed `scrollIntoView` from marker to itinerary row was not found and should be made explicit/tested during Phase 3 rather than assumed.

### 5.3 Manual/search add flow

```text
ItineraryPanel query
  → resolveManualPlaceLocation
  → /api/places/suggest
  → geocodePlace / Google-backed candidate ranking
  → normalized PlaceSuggestion
  → confirmation UI
  → TripPlanItem + LocationReference
  → mapSync
  → MapPin
```

Map-click add currently receives Google `placeId` and coordinates, then uses `MapPoiAddOverlay`/`usePendingPoiPreview` to resolve and add it. MapLibre should emit coordinates, call AIYO reverse geocoding, and render the same add-card UX through a popup or positioned overlay.

### 5.4 AI Agent flow

```text
Chat planner output
  → AssistantAction[]
  → applyAssistantActions
  → add/update/remove/reorder useTripStore
  → geocodeAssistantActionTargets
  → /api/places/geocode
  → LocationReference
  → reconcileTripMapState
  → useMapStore pins/selection
```

The agent currently knows abstract actions, not Google SDK objects. This boundary should be preserved. New tools may expose `search_place`, `search_nearby_places`, `get_route`, and `get_travel_time`, but provider names must remain server-side implementation details.

### 5.5 Video to map

```text
YouTube transcript/description
  → place extraction
  → Google-backed verification/geocoding
  → LocationReference[]
  → VideoSummaryDrawer / importVideoVerifiedPlacesToTrip
  → itinerary + pins
```

This flow is a critical hidden migration dependency: replacing the visible map alone would leave the video pipeline dependent on Google.

## 6. Target architecture

```text
React UI / AI actions / video pipeline
               │
       AIYO provider-neutral types
               │
        AIYO Maps API routes
               │
      MapService orchestration layer
       │          │           │
    Photon     Overpass      OSRM
 search/rev.    nearby    route/table

React renderer
  → MapLibre GL JS
  → OpenFreeMap style/tiles
  → OSM/OpenFreeMap attribution
```

Recommended placement following current conventions:

```text
src/server/maps/
  types.ts
  config.ts
  errors.ts
  cache.ts
  service.ts
  categories.ts
  providers/photon.ts
  providers/overpass.ts
  providers/osrm.ts

src/lib/maps/
  client.ts
  contracts.ts
  markerOrder.ts

src/app/api/maps/
  search/route.ts
  reverse/route.ts
  nearby/route.ts
  route/route.ts
  matrix/route.ts
```

Existing `/api/map/*` and `/api/places/*` endpoints should temporarily delegate to the new service so existing components, AI actions and tests can migrate incrementally.

## 7. Verified provider interfaces

- OpenFreeMap officially documents the MapLibre style URL `https://tiles.openfreemap.org/styles/liberty` and requires MapLibre CSS. Other listed official styles include Positron, Bright, Dark, Fiord and 3D. Initial rollout should use the documented Liberty endpoint through configurable `NEXT_PUBLIC_MAP_STYLE_URL`, defaulting to the official URL.
- Photon officially provides `/api` forward search and `/reverse`, returning GeoJSON. The base URL must be centralized as `MAP_PHOTON_BASE_URL`; raw Photon features must be normalized server-side.
- Overpass accepts server-generated Overpass QL at `/api/interpreter`. Public instances are shared infrastructure and explicitly require conservative use, caching and rate limiting.
- OSRM v1 uses longitude-latitude coordinate order and provides `/route/v1/{profile}/...` plus `/table/v1/{profile}/...`; GeoJSON route geometry, seconds and meters can be normalized directly.

Official references:

- https://openfreemap.org/quick_start/
- https://github.com/komoot/photon/blob/master/docs/api-v1.md
- https://wiki.openstreetmap.org/wiki/Overpass_API
- https://project-osrm.org/docs/v26.4.0/http

## 8. Provider-neutral service contracts

```ts
interface MapService {
  searchPlaces(query: string, options?: SearchPlaceOptions): Promise<MapPoi[]>;
  reverseGeocode(point: GeoPoint, options?: LocaleOptions): Promise<MapPoi | null>;
  searchNearbyPoi(point: GeoPoint, options: NearbyPoiOptions): Promise<MapPoi[]>;
  getRoute(points: GeoPoint[], options?: RouteOptions): Promise<MapRoute>;
  getDistanceMatrix(points: GeoPoint[], options?: MatrixOptions): Promise<MapDistanceMatrix>;
}
```

Required server policies:

- strict finite coordinate/range validation;
- search length and result limits;
- nearby categories from a static semantic map only;
- maximum nearby radius and result count;
- maximum route/matrix waypoint counts;
- 5s Photon, 12s Overpass and 8s OSRM default timeouts;
- one bounded retry only for safe transient failures, never for validation failures;
- normalized TTL cache keys and bounded in-memory cache initially;
- existing process-local rate limiter integrated at search, nearby and route endpoints;
- safe error codes: `MAP_SEARCH_FAILED`, `MAP_GEOCODE_FAILED`, `MAP_NEARBY_FAILED`, `MAP_ROUTE_FAILED`, `MAP_LOAD_FAILED`;
- structured server logs: operation/provider/duration/status/cacheHit, with no query bodies or user data unless safely summarized.

Initial category mapping should be an allowlist such as:

| AIYO category | OSM tag alternatives |
|---|---|
| restaurant | `amenity=restaurant` |
| cafe | `amenity=cafe` |
| hotel | `tourism=hotel`, `tourism=hostel`, `tourism=guest_house` |
| attraction | `tourism=attraction` |
| museum | `tourism=museum` |
| park | `leisure=park`, `leisure=garden` |
| convenience | `shop=convenience` |
| parking | `amenity=parking` |
| station | `railway=station`, `public_transport=station` |

The client must send only the category enum; it must never send Overpass QL.

## 9. Cache and configuration design

Suggested configuration, with no keys because these providers are endpoint-based:

```env
MAP_PROVIDER=osm
MAP_PHOTON_BASE_URL=https://photon.komoot.io
MAP_OVERPASS_BASE_URL=https://overpass-api.de/api/interpreter
MAP_OSRM_BASE_URL=https://router.project-osrm.org
MAP_DEFAULT_LANGUAGE=zh-TW
MAP_DEFAULT_COUNTRY=TW
MAP_SEARCH_CACHE_TTL_SECONDS=86400
MAP_NEARBY_CACHE_TTL_SECONDS=900
MAP_ROUTE_CACHE_TTL_SECONDS=3600
NEXT_PUBLIC_MAP_STYLE_URL=https://tiles.openfreemap.org/styles/liberty
```

All endpoints must remain replaceable for self-hosting. Cache keys should normalize trimmed/lowercase query, BCP-47 language, rounded coordinates, sorted/validated options and ordered route coordinates. Do not cache authentication or user identity.

## 10. MapLibre lifecycle and rendering plan

- Create exactly one `Map` per mounted container and remove it on unmount.
- Keep map, marker and popup instances in refs local to the renderer.
- Observe container/sidebar size and call `map.resize()` after visibility/layout transitions.
- Diff markers by stable pin ID: update existing marker position/content, remove stale markers, create only new markers.
- Generate stop numbers from `buildPinStopOrderByPinId` so reorder behavior remains identical.
- Use one Popup whose content is updated from selected pin state, or carefully dispose per-marker popups.
- Use a stable GeoJSON source for route geometry and `setData()` on itinerary/reorder changes. Layers are created after style load and not recreated on every render.
- Fit bounds after initial load, itinerary/day changes and explicit fit requests; selected-item focus uses `easeTo`/`flyTo` without fighting automatic bounds.
- Preserve OpenFreeMap and `© OpenStreetMap contributors` attribution.
- Traffic/transit layers have no direct OpenFreeMap equivalent. Preserve settings compatibility but mark unavailable until an explicit provider is selected; do not fake those layers.

## 11. Legacy Google data compatibility

1. Preserve persisted `placeId`, `googleMapsUrl`, photos and ratings during the transition.
2. Introduce provider/external ID fields additively; interpret bare historical `placeId` as `legacy-google`.
3. Render old items from stored coordinates without any Google request.
4. Continue proxying already stored Google photos only while legally/technically valid; never make them required for map usability.
5. Do not fabricate OSM ratings, reviews, photos or popular-times data.
6. UI details cards must tolerate absent rating/photo/phone/opening hours.
7. Only after data readers no longer require Google IDs should env settings, runtime key exposure, loader, proxy and Google code be removed.

## 12. Migration phases and gates

### Phase 0 — Audit

- Deliver this document and preserve all code.
- Gate: repository search, architecture map and provider documentation verified.

### Phase 1 — Provider-independent contracts

- Add canonical geo/POI/route/matrix/error types, configuration, cache and provider interfaces.
- Add adapters to current `LocationReference`, `MapPin` and API response formats.
- Keep Google renderer and routes working.
- Tests: coordinate/options/cache/error contracts; lint, unit and build.

### Phase 2 — MapLibre + OpenFreeMap renderer shell

- Add `maplibre-gl`; add CSS through the application layout/style entry point.
- Implement lifecycle-safe map renderer behind a temporary feature flag.
- Keep current `MapView` composition, panel and loading/error UI.
- Tests: init/unmount/resize/no-key/attribution; lint, unit, build and browser smoke.

### Phase 3 — Markers, selection, popup, bounds and GeoJSON route layer

- Port marker diffing, numbering, click selection, item focus, popup and bounds behavior.
- Port route presentation to a stable GeoJSON source/layer.
- Explicitly add marker-to-row scrolling if required by acceptance criteria.
- Tests: empty/single/multiple/invalid pins, reorder numbering, bidirectional selection, day filter and stale-marker cleanup.

### Phase 4 — Photon search and reverse geocoding

- Implement normalized server providers and `/api/maps/search`, `/api/maps/reverse`.
- Delegate existing suggest/geocode routes to the new service.
- Preserve destination-scope confidence gates and add 300–400ms debounced, abortable client search.
- Test Traditional Chinese, Taiwan bias, non-Taiwan travel and provider failure.

### Phase 5 — Overpass nearby POI

- Implement semantic category allowlist, bounded server-generated QL and `/api/maps/nearby`.
- Integrate nearby UI without exposing provider schema/query language.
- Test node/way/relation center normalization, limits, injection resistance, cache/rate limit and timeout.

### Phase 6 — OSRM route and matrix

- Implement `/api/maps/route` and `/api/maps/matrix` with normalized GeoJSON/meters/seconds.
- Replace browser Google route calls and server travel-time enrichment.
- Preserve straight-line markers/route fallback if OSRM fails.
- Test waypoint order after reorder, timeout/no-route, matrix null cells and marker survival.

### Phase 7 — AI and video integration

- Point assistant geocode targets, planner research and video place verification to AIYO MapService.
- Add provider-agnostic agent tools without naming Photon/Overpass/OSRM.
- Preserve verified POI, destination scope and fallback policies.

### Phase 8 — Full tests and staged default

- Extend existing unit and Playwright systems; mock AIYO map APIs in CI.
- Test all required scenarios and make MapLibre the default after parity.
- Run every project-supported gate after each correction.

### Phase 9 — Google removal

- Repository-wide zero-use review.
- Remove loader, Google route/geocode utilities, runtime client key exposure, env examples and Docker arguments.
- Retain only explicitly named legacy data fields/adapters and historical documentation/data.
- Final repository search classifies every remaining Google reference.

## 13. Test matrix required for implementation

### Unit

- Photon GeoJSON forward/reverse normalization, localized name fallback and invalid feature handling.
- Overpass node/way/relation normalization and category mapping.
- OSRM route/table normalization, `[lng,lat]` ordering and null/unroutable results.
- coordinate/options/cache key normalization.
- timeout, retry, provider-error mapping and rate limiting.
- itinerary-to-marker order and invalid coordinate filtering.

### Component

- map initialization and teardown once per mount.
- empty/single/multiple markers.
- itinerary reorder changes labels without leaking markers.
- selected itinerary item focuses/highlights marker and marker click selects/scrolls item.
- popup and graceful missing metadata.
- route source updates without map recreation.

### Integration and Playwright

- `/map` renders without any Google key or Google script.
- MapLibre canvas/container and attribution exist.
- mocked Photon result `台北101` can be added and becomes a marker.
- mocked nearby restaurant result can be added.
- mocked OSRM A→B→C route produces a line and meters/seconds.
- reorder C→A→B updates marker numbers and request coordinate order.
- OSRM timeout leaves markers usable and shows route-specific error.
- browser console contains no `BillingNotEnabledMapError`, Google Maps API error or `google is not defined`.

## 14. Risks and decisions

| Risk | Impact | Mitigation |
|---|---|---|
| `MapView.tsx` combines too many concerns | renderer rewrite can break selection, details or route UI | extract provider-neutral hooks/adapters incrementally; do not rewrite page/panel |
| Photon quality differs from Google, especially POI names | verified-place planner quality may regress | retain internal catalog and destination-scope scoring; compare candidates in fixtures |
| OSM lacks Google photos/ratings | detail cards become sparse | optional graceful UI; never fabricate; retain legacy values |
| Public Overpass reliability/usage policy | nearby feature intermittent at scale | server cache/rate limits/timeouts and configurable/self-host endpoint |
| Public OSRM profile/availability limitations | transit/cycling behavior can be misleading | advertise only configured profiles and fall back honestly |
| Historical `placeId` used as identity/dedupe key | duplicate or broken linkage | introduce provider-qualified identity, preserve stable item/pin IDs |
| Client map style is third-party infrastructure | style outage affects display | configurable style URL, `MAP_LOAD_FAILED` UI and future self-host option |
| Attribution removal during custom styling | license/compliance issue | automated DOM assertion and design requirement |

## 15. Phase 0 completion criteria

- Google rendering, geo/search/details, routing, data, environment, tests and documentation dependencies have been classified.
- Existing itinerary → pin → marker ordering and bidirectional selection flows are mapped.
- Hidden AI/video dependencies are identified.
- Official provider interfaces and current OpenFreeMap style URL are verified.
- A staged, minimally invasive implementation path and quality gates are defined.
- Production/test code remains unchanged.

