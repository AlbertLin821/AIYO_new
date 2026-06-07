import assert from "node:assert/strict";
import test from "node:test";

import {
  fetchItineraryRoutePaths,
  resetFetchItineraryDirectionsCacheForTest,
  type LatLngPoint,
} from "@/lib/fetchItineraryDirections";
import type { ItineraryRouteSegment } from "@/lib/routeSegments";
import type { GoogleMapsApi } from "@/services/googleMapsLoader";

function createSegment(overrides: Partial<ItineraryRouteSegment> = {}): ItineraryRouteSegment {
  return {
    id: "seg-1",
    dayNumber: 1,
    fromItemId: "from-1",
    toItemId: "to-1",
    fromName: "A",
    toName: "B",
    fromTime: "09:00",
    toTime: "10:00",
    transport: "Transit",
    distanceKm: 3.2,
    estimatedMinutes: 18,
    color: "#123456",
    from: { lat: 25.033, lng: 121.5654 },
    to: { lat: 25.0478, lng: 121.5319 },
    ...overrides,
  };
}

function createMapsApiWithRoutes(
  computeRoutes: (request: Record<string, unknown>) => Promise<{ routes?: Array<{ path?: unknown[]; durationMillis?: number }> }>,
): GoogleMapsApi {
  return {
    Map: class {} as never,
    Size: class {} as never,
    Point: class {} as never,
    Marker: class {} as never,
    Polyline: class {} as never,
    InfoWindow: class {} as never,
    LatLng: class {} as never,
    LatLngBounds: class {} as never,
    OverlayView: class {} as never,
    TrafficLayer: class {} as never,
    TransitLayer: class {} as never,
    BicyclingLayer: class {} as never,
    SymbolPath: { CIRCLE: {} },
    TravelMode: {
      DRIVING: "DRIVING",
      WALKING: "WALKING",
      BICYCLING: "BICYCLING",
      TRANSIT: "TRANSIT",
    },
    importLibrary: async (name: string) => {
      if (name !== "routes") {
        throw new Error(`unexpected library ${name}`);
      }
      return {
        Route: {
          computeRoutes,
        },
      };
    },
  };
}

test("fetchItineraryRoutePaths uses Route.computeRoutes path and duration when available", async () => {
  resetFetchItineraryDirectionsCacheForTest();
  const segment = createSegment();
  let capturedRequest: Record<string, unknown> | null = null;
  const mapsApi = createMapsApiWithRoutes(async (request) => {
    capturedRequest = request;
    return {
      routes: [
        {
          path: [
            { lat: 25.033, lng: 121.5654 },
            { latitude: 25.04, longitude: 121.55 },
            { lat: 25.0478, lng: 121.5319 },
          ],
          durationMillis: 900000,
        },
      ],
    };
  });

  const result = await fetchItineraryRoutePaths(mapsApi, [segment], {
    cancelled: () => false,
    region: "tw",
  });

  assert.equal(result.length, 1);
  assert.equal(result[0]?.usedDirections, true);
  assert.equal(result[0]?.durationSeconds, 900);
  assert.deepEqual(result[0]?.path, [
    { lat: 25.033, lng: 121.5654 },
    { lat: 25.04, lng: 121.55 },
    { lat: 25.0478, lng: 121.5319 },
  ] satisfies LatLngPoint[]);
  assert.deepEqual(capturedRequest?.origin, segment.from);
  assert.deepEqual(capturedRequest?.destination, segment.to);
  assert.deepEqual(capturedRequest?.fields, ["durationMillis", "path"]);
});

test("fetchItineraryRoutePaths falls back to straight line without DirectionsService when Route.computeRoutes fails", async () => {
  resetFetchItineraryDirectionsCacheForTest();
  const segment = createSegment();
  let computeCalls = 0;
  let directionsConstructed = 0;
  const mapsApi = createMapsApiWithRoutes(async () => {
    computeCalls += 1;
    throw new Error("routes unavailable");
  }) as GoogleMapsApi & {
    DirectionsService?: new () => unknown;
  };
  mapsApi.DirectionsService = class {
    constructor() {
      directionsConstructed += 1;
    }
  } as never;

  const result = await fetchItineraryRoutePaths(mapsApi, [segment], {
    cancelled: () => false,
    region: "tw",
  });

  assert.equal(computeCalls, 2);
  assert.equal(directionsConstructed, 0);
  assert.equal(result[0]?.usedDirections, false);
  assert.deepEqual(result[0]?.path, [segment.from, segment.to]);
});
