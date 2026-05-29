export type GoogleMapTypeId = "roadmap" | "satellite" | "hybrid" | "terrain";

export interface GoogleMapInstance {
  setCenter: (coords: { lat: number; lng: number }) => void;
  setZoom: (zoom: number) => void;
  getZoom: () => number | undefined;
  fitBounds: (bounds: GoogleLatLngBounds, padding?: number) => void;
  panTo: (coords: { lat: number; lng: number }) => void;
  setMapTypeId: (type: GoogleMapTypeId) => void;
}

export interface GoogleMarkerInstance {
  setMap: (map: GoogleMapInstance | null) => void;
  setIcon: (icon: Record<string, unknown>) => void;
  addListener: (eventName: string, handler: () => void) => void;
}

export interface GoogleInfoWindowInstance {
  setContent: (content: string) => void;
  open: (input: { map: GoogleMapInstance; anchor: GoogleMarkerInstance | unknown }) => void;
}

export interface GooglePolylineInstance {
  setMap: (map: GoogleMapInstance | null) => void;
  addListener?: (eventName: string, handler: () => void) => void;
}

export interface GoogleMapLayerInstance {
  setMap: (map: GoogleMapInstance | null) => void;
}

export interface GoogleLatLngBounds {
  extend: (coords: { lat: number; lng: number }) => void;
}

export interface GooglePlacePhoto {
  getUrl: (options?: { maxWidth?: number; maxHeight?: number }) => string;
}

export interface GooglePlaceDetailsResult {
  name?: string;
  formatted_address?: string;
  formatted_phone_number?: string;
  international_phone_number?: string;
  opening_hours?: {
    weekday_text?: string[];
  };
  photos?: GooglePlacePhoto[];
  website?: string;
  url?: string;
  rating?: number;
  user_ratings_total?: number;
}

export interface GooglePlacesServiceInstance {
  getDetails: (
    request: { placeId: string; fields: string[] },
    callback: (result: GooglePlaceDetailsResult | null, status: string) => void,
  ) => void;
}

export interface GoogleMapsApi {
  Map: new (
    element: HTMLElement,
    options: Record<string, unknown>,
  ) => GoogleMapInstance;
  /** Legacy Marker icon sizing / anchor (maps.Size, maps.Point). */
  Size: new (width: number, height: number) => unknown;
  Point: new (x: number, y: number) => unknown;
  Marker: new (options: Record<string, unknown>) => GoogleMarkerInstance;
  Polyline: new (options: Record<string, unknown>) => GooglePolylineInstance;
  InfoWindow: new () => GoogleInfoWindowInstance;
  LatLngBounds: new () => GoogleLatLngBounds;
  TrafficLayer: new () => GoogleMapLayerInstance;
  TransitLayer: new () => GoogleMapLayerInstance;
  BicyclingLayer: new () => GoogleMapLayerInstance;
  SymbolPath: {
    CIRCLE: unknown;
  };
  places?: {
    PlacesService: new (map: GoogleMapInstance | HTMLElement) => GooglePlacesServiceInstance;
    PlacesServiceStatus?: {
      OK: string;
    };
  };
  /** Dynamic import for AdvancedMarkerElement (marker library) and Routes API, etc. */
  importLibrary?: (name: string) => Promise<Record<string, unknown>>;
}

let googleMapsPromise: Promise<GoogleMapsApi> | null = null;
const GOOGLE_MAPS_LOAD_TIMEOUT_MS = 12_000;

declare global {
  interface Window {
    __aiyoGoogleMapsInit?: () => void | Promise<void>;
    /** Called by Maps JS when the API key is rejected (e.g. expired, wrong restrictions). */
    gm_authFailure?: () => void;
    google?: { maps: GoogleMapsApi };
  }
}

export const AIYO_MAPS_AUTH_FAILURE_EVENT = "aiyo-google-maps-auth-failure";

function resetLoaderPromise() {
  googleMapsPromise = null;
}

async function hydrateMapsApiFromImportLibrary(): Promise<GoogleMapsApi> {
  const importLibrary = window.google?.maps?.importLibrary;
  if (typeof importLibrary !== "function") {
    throw new Error("Google Maps importLibrary is not available.");
  }

  const mapsLib = (await importLibrary("maps")) as Record<string, unknown>;
  const base = window.google?.maps ?? ({} as GoogleMapsApi);
  const mapsApi = Object.assign(base, mapsLib) as GoogleMapsApi;
  mapsApi.importLibrary = importLibrary.bind(window.google!.maps);
  window.google = { maps: mapsApi };
  return mapsApi;
}

export function loadGoogleMapsApi(apiKey: string): Promise<GoogleMapsApi> {
  if (!apiKey) {
    return Promise.reject(new Error("GOOGLE_MAPS_API_KEY is not configured."));
  }

  if (typeof window === "undefined") {
    return Promise.reject(new Error("Google Maps can only load in the browser."));
  }

  if (window.google?.maps?.Map) {
    return Promise.resolve(window.google.maps);
  }

  if (googleMapsPromise) {
    return googleMapsPromise;
  }

  googleMapsPromise = new Promise((resolve, reject) => {
    let timeoutId: number | null = window.setTimeout(() => {
      rejectWithCleanup(new Error("Google Maps SDK loading timed out."));
    }, GOOGLE_MAPS_LOAD_TIMEOUT_MS);

    const clearLoadTimeout = () => {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
        timeoutId = null;
      }
    };

    const rejectWithCleanup = (error: Error) => {
      clearLoadTimeout();
      resetLoaderPromise();
      reject(error);
    };

    const finishWithMaps = async () => {
      try {
        const mapsApi = await hydrateMapsApiFromImportLibrary();
        clearLoadTimeout();
        resolve(mapsApi);
      } catch (error) {
        rejectWithCleanup(
          error instanceof Error ? error : new Error("Failed to load Google Maps libraries."),
        );
      }
    };

    const existingScript = document.getElementById("aiyo-google-maps-sdk") as HTMLScriptElement | null;
    if (existingScript) {
      if (window.google?.maps?.Map) {
        void finishWithMaps();
        return;
      }
      existingScript.addEventListener("load", () => {
        void finishWithMaps();
      });
      existingScript.addEventListener("error", () =>
        rejectWithCleanup(new Error("Failed to load Google Maps SDK.")),
      );
      return;
    }

    let settled = false;

    const previousAuthFailure = window.gm_authFailure;
    window.gm_authFailure = () => {
      previousAuthFailure?.();
      if (!settled) {
        settled = true;
        window.dispatchEvent(new CustomEvent(AIYO_MAPS_AUTH_FAILURE_EVENT));
        rejectWithCleanup(
          new Error(
            "Google Maps API key is invalid, expired, or not allowed for Maps JavaScript API. Create a new key in Google Cloud Console, enable billing, and enable Maps JavaScript API.",
          ),
        );
      } else {
        window.dispatchEvent(new CustomEvent(AIYO_MAPS_AUTH_FAILURE_EVENT));
      }
    };

    window.__aiyoGoogleMapsInit = () => {
      if (settled) {
        return;
      }
      settled = true;
      void finishWithMaps();
    };

    const script = document.createElement("script");
    script.id = "aiyo-google-maps-sdk";
    script.async = true;
    script.defer = true;
    const params = new URLSearchParams({
      key: apiKey,
      loading: "async",
      callback: "__aiyoGoogleMapsInit",
      v: "weekly",
    });
    script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
    script.onerror = () => {
      if (!settled) {
        settled = true;
        rejectWithCleanup(new Error("Failed to load Google Maps SDK."));
      }
    };
    document.head.appendChild(script);
  });

  return googleMapsPromise;
}
